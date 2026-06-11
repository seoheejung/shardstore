import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AddressInfo } from "node:net";
import test from "node:test";

import { connectFtpClient } from "./ftp-client";
import { createFtpServer } from "./ftp-server";
import { resolveFtpDataDir } from "./ftp-protocol";

test("FTP-style TCP server handles ls, put, get, checksum comparison, and quit", async () => {
  const projectRoot = process.cwd();
  const ftpDataDir = resolveFtpDataDir(projectRoot);
  const tempRoot = path.join(tmpdir(), `shardstore-ftp-${randomUUID()}`);
  const sourceDir = path.join(tempRoot, "source");
  const downloadDir = path.join(tempRoot, "download");
  const filename = `phase7-${randomUUID()}.txt`;
  const sourcePath = path.join(sourceDir, filename);
  const serverPath = path.join(ftpDataDir, filename);
  const downloadPath = path.join(downloadDir, filename);
  const body = Buffer.from("phase 7 ftp socket transfer\n");
  const checksum = createHash("sha256").update(body).digest("hex");
  const server = createFtpServer({ projectRoot });

  await mkdir(sourceDir, { recursive: true });
  await mkdir(downloadDir, { recursive: true });
  await writeFile(sourcePath, body);

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });

    const { port } = server.address() as AddressInfo;
    const client = await connectFtpClient({
      host: "127.0.0.1",
      port,
      downloadDir
    });

    const beforeList = await client.list();
    assert.ok("files" in beforeList);
    assert.equal(beforeList.files.includes(filename), false);

    const upload = await client.put(sourcePath);
    assert.deepEqual(upload, {
      uploaded: true,
      filename,
      size: body.length,
      checksum_matched: true
    });
    assert.equal(
      createHash("sha256").update(await readFile(serverPath)).digest("hex"),
      checksum
    );

    const afterList = await client.list();
    assert.ok("files" in afterList);
    assert.equal(afterList.files.includes(filename), true);

    const invalidGet = await client.executeCommand("get ../secret.txt");
    assert.deepEqual(invalidGet, {
      error: {
        code: "invalid_filename",
        message: "invalid filename"
      }
    });

    const missingPut = await client.executeCommand("put missing.txt");
    assert.deepEqual(missingPut, {
      error: {
        code: "local_file_not_found",
        message: "local file not found"
      }
    });

    const download = await client.get(filename);
    assert.deepEqual(download, {
      downloaded: true,
      filename,
      output_path: filename,
      checksum_matched: true
    });
    assert.equal(
      createHash("sha256").update(await readFile(downloadPath)).digest("hex"),
      checksum
    );

    const quit = await client.quit();
    assert.deepEqual(quit, { closed: true });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }).catch(() => undefined);
    await rm(serverPath, { force: true });
    await rm(tempRoot, { recursive: true, force: true });
  }
});
