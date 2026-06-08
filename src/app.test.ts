import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  await withServer(async (baseUrl, dataRoot) => {
    const bucket = "photo-bucket";
    const key = "2026/05/sample.txt";
    const body = Buffer.from("0123456789");
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
    assert.equal(metadata.schema_version, 3);
    assert.equal(metadata.object_id, uploaded.object_id);
    assert.equal(metadata.storage_type, "erasure_coded");
    assert.deepEqual(metadata.coding, {
      algorithm: "reed-solomon",
      data_shards: 2,
      parity_shards: 1,
      total_shards: 3,
      recoverable_shard_loss: 1
    });
    assert.equal(metadata.shards.length, 3);
    assert.deepEqual(
      metadata.shards.map((shard: { index: number }) => shard.index),
      [0, 1, 2]
    );
    assert.deepEqual(
      metadata.shards.map((shard: { size: number }) => shard.size),
      [5, 5, 5]
    );
    assert.deepEqual(
      metadata.shards.map((shard: { role: string }) => shard.role),
      ["data", "data", "parity"]
    );
    assert.deepEqual(
      metadata.shards.map((shard: { tier: string }) => shard.tier),
      ["hot", "hot", "cold"]
    );

    const shardBuffers = await Promise.all(
      metadata.shards.map(
        async (shard: {
          index: number;
          role: "data" | "parity";
          tier: "hot" | "cold";
          path: string;
          size: number;
          checksum: string;
        }) => {
          const expectedPath =
            shard.role === "data"
              ? `shards/${uploaded.object_id}/hot/shard_${shard.index}.data`
              : `shards/${uploaded.object_id}/cold/parity_0.data`;
          assert.equal(shard.path, expectedPath);
          const shardData = await readFile(
            path.join(dataRoot, "buckets", bucket, shard.path)
          );
          assert.equal(shardData.length, shard.size);
          assert.equal(
            createHash("sha256").update(shardData).digest("hex"),
            shard.checksum
          );
          return shardData;
        }
      )
    );
    assert.equal(
      Buffer.concat(shardBuffers.slice(0, 2)).subarray(0, body.length).toString(),
      body.toString()
    );
    assert.equal(
      await pathExists(
        path.join(dataRoot, "buckets", bucket, "objects", `${uploaded.object_id}.data`)
      ),
      false
    );
    assert.equal(
      await pathExists(
        path.join(
          dataRoot,
          "buckets",
          bucket,
          "shards",
          uploaded.object_id,
          "shard_0.data"
        )
      ),
      false
    );

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
      `${baseUrl}/debug/objects/${uploaded.object_id}/delete-shards?count=1`,
      { method: "POST" }
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object_id: uploaded.object_id,
      deleted_count: 1,
      deleted_shards: [
        {
          role: "data",
          tier: "hot",
          index: 1,
          path: `shards/${uploaded.object_id}/hot/shard_1.data`
        }
      ]
    });
    assert.equal(
      await pathExists(
        path.join(
          dataRoot,
          "buckets",
          bucket,
          "shards",
          uploaded.object_id,
          "hot",
          "shard_1.data"
        )
      ),
      false
    );

    response = await fetch(`${baseUrl}/debug/objects/${uploaded.object_id}/recover`, {
      method: "POST"
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object_id: uploaded.object_id,
      recovered: true,
      recovered_shards: [
        {
          role: "data",
          tier: "hot",
          index: 1,
          path: `shards/${uploaded.object_id}/hot/shard_1.data`
        }
      ],
      checksum_matched: true
    });
    const recoveredShard = metadata.shards.find(
      (shard: { index: number }) => shard.index === 1
    );
    assert.ok(recoveredShard);
    assert.equal(
      createHash("sha256")
        .update(
          await readFile(
            path.join(
              dataRoot,
              "buckets",
              bucket,
              "shards",
              uploaded.object_id,
              "hot",
              "shard_1.data"
            )
          )
        )
        .digest("hex"),
      recoveredShard.checksum
    );

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
    assert.equal(
      await pathExists(
        path.join(dataRoot, "buckets", bucket, "shards", uploaded.object_id)
      ),
      false
    );

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
    const firstShard = metadata.shards.find(
      (shard: { index: number }) => shard.index === 0
    );
    assert.ok(firstShard);
    await writeFile(
      path.join(dataRoot, "buckets", bucket, firstShard.path),
      "corrupted"
    );

    const response = await fetch(
      `${baseUrl}/buckets/${bucket}/objects?key=${encodeURIComponent(key)}`
    );
    assert.equal(response.status, 500);
    assert.equal((await response.json()).error.code, "checksum_mismatch");
  });
});

test("recovery refuses objects with more missing shards than parity allows", async () => {
  await withServer(async (baseUrl) => {
    const bucket = "recovery-bucket";
    const key = "sample-fail.bin";
    const body = Buffer.from("cannot recover two missing shards");

    await fetch(`${baseUrl}/buckets/${bucket}`, { method: "PUT" });

    const form = new FormData();
    form.set("file", new Blob([body]), "sample-fail.bin");
    const uploadResponse = await fetch(
      `${baseUrl}/buckets/${bucket}/objects?key=${encodeURIComponent(key)}`,
      { method: "PUT", body: form }
    );
    const uploaded = await uploadResponse.json();

    let response = await fetch(
      `${baseUrl}/debug/objects/${uploaded.object_id}/delete-shards?count=2`,
      { method: "POST" }
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).deleted_count, 2);

    response = await fetch(`${baseUrl}/debug/objects/${uploaded.object_id}/recover`, {
      method: "POST"
    });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: {
        code: "too_many_missing_shards",
        message: "too many missing shards to recover",
        missing_count: 2,
        recoverable_shard_loss: 1
      }
    });
  });
});

async function pathExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (isNotFound(error)) {
      return false;
    }
    throw error;
  }
}

function isNotFound(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

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
