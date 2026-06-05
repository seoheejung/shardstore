import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AddressInfo } from "node:net";
import test from "node:test";

import { createApp } from "./app";

async function withServer(
  callback: (baseUrl: string, dataRoot: string) => Promise<void>
) {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "shardstore-test-"));
  const app = createApp({ dataRoot });
  const server = app.listen(0);

  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    await callback(`http://127.0.0.1:${port}`, dataRoot);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await rm(dataRoot, { recursive: true, force: true });
  }
}

test("bucket and object APIs store, verify, list, download, and delete objects", async () => {
  await withServer(async (baseUrl) => {
    const bucket = "photo-bucket";
    const key = "2026/05/sample.txt";
    const body = Buffer.from("sample object body");
    const checksum = createHash("sha256").update(body).digest("hex");

    let response = await fetch(`${baseUrl}/buckets/${bucket}`, {
      method: "PUT"
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { bucket, created: true });

    response = await fetch(`${baseUrl}/buckets/${bucket}`, { method: "PUT" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { bucket, created: false });

    response = await fetch(`${baseUrl}/buckets/${bucket}`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { bucket, exists: true });

    response = await fetch(`${baseUrl}/buckets`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { buckets: [bucket] });

    const form = new FormData();
    form.set("file", new Blob([body], { type: "text/plain" }), "sample.txt");

    response = await fetch(
      `${baseUrl}/buckets/${bucket}/objects?key=${encodeURIComponent(key)}`,
      { method: "PUT", body: form }
    );
    assert.equal(response.status, 200);
    const uploaded = await response.json();
    assert.equal(uploaded.bucket, bucket);
    assert.equal(uploaded.key, key);
    assert.equal(uploaded.size, body.length);
    assert.equal(uploaded.checksum, checksum);
    assert.match(uploaded.object_id, /^[0-9a-f-]{36}$/);

    const duplicateForm = new FormData();
    duplicateForm.set("file", new Blob([body]), "sample.txt");
    response = await fetch(
      `${baseUrl}/buckets/${bucket}/objects?key=${encodeURIComponent(key)}`,
      { method: "PUT", body: duplicateForm }
    );
    assert.equal(response.status, 409);

    response = await fetch(
      `${baseUrl}/buckets/${bucket}/objects/metadata?key=${encodeURIComponent(
        key
      )}`
    );
    assert.equal(response.status, 200);
    const metadata = await response.json();
    assert.equal(metadata.schema_version, 1);
    assert.equal(metadata.object_id, uploaded.object_id);
    assert.equal(metadata.storage_path, `objects/${uploaded.object_id}.data`);

    response = await fetch(`${baseUrl}/buckets/${bucket}/objects`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      objects: [
        {
          object_id: uploaded.object_id,
          key,
          size: body.length,
          checksum,
          created_at: metadata.created_at
        }
      ]
    });

    response = await fetch(
      `${baseUrl}/buckets/${bucket}/objects?key=${encodeURIComponent(key)}`
    );
    assert.equal(response.status, 200);
    assert.equal(Buffer.from(await response.arrayBuffer()).toString(), body.toString());

    response = await fetch(
      `${baseUrl}/buckets/${bucket}/objects?key=${encodeURIComponent(key)}`,
      { method: "DELETE" }
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { deleted: true, bucket, key });

    response = await fetch(
      `${baseUrl}/buckets/${bucket}/objects/metadata?key=${encodeURIComponent(
        key
      )}`
    );
    assert.equal(response.status, 404);
  });
});

test("download refuses data when stored checksum no longer matches metadata", async () => {
  await withServer(async (baseUrl, dataRoot) => {
    const bucket = "checksum-bucket";
    const key = "sample.bin";
    const body = Buffer.from("verified body");

    await fetch(`${baseUrl}/buckets/${bucket}`, { method: "PUT" });

    const form = new FormData();
    form.set("file", new Blob([body]), "sample.bin");
    const uploadResponse = await fetch(
      `${baseUrl}/buckets/${bucket}/objects?key=${encodeURIComponent(key)}`,
      { method: "PUT", body: form }
    );
    const uploaded = await uploadResponse.json();

    const metadataPath = path.join(
      dataRoot,
      "buckets",
      bucket,
      "metadata",
      "objects",
      `${uploaded.object_id}.json`
    );
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    await writeFile(
      path.join(dataRoot, "buckets", bucket, metadata.storage_path),
      "corrupted"
    );

    const response = await fetch(
      `${baseUrl}/buckets/${bucket}/objects?key=${encodeURIComponent(key)}`
    );
    assert.equal(response.status, 500);
    assert.equal((await response.json()).error.code, "checksum_mismatch");
  });
});

test("unsafe bucket names and missing upload fields return JSON errors", async () => {
  await withServer(async (baseUrl) => {
    let response = await fetch(`${baseUrl}/buckets/../secret`, {
      method: "PUT"
    });
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, "not_found");

    response = await fetch(`${baseUrl}/buckets/safe-bucket`, { method: "PUT" });
    assert.equal(response.status, 200);

    response = await fetch(`${baseUrl}/buckets/safe-bucket/objects?key=file`, {
      method: "PUT"
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "missing_file");
  });
});
