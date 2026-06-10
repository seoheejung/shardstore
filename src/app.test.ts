import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AddressInfo } from "node:net";
import test from "node:test";

import { createApp } from "./app";
import { MetadataMigrationService } from "./modules/migration/metadata-migration.service";
import { LocalStorage } from "./modules/storage/local-storage";

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

test("normal download reads hot data shards without requiring cold parity", async () => {
  await withServer(async (baseUrl, dataRoot) => {
    const bucket = "tier-bucket";
    const key = "hot-download.bin";
    const body = Buffer.from("hot data shards are enough for normal reads");

    await fetch(`${baseUrl}/buckets/${bucket}`, { method: "PUT" });

    const form = new FormData();
    form.set("file", new Blob([body]), "hot-download.bin");
    const uploadResponse = await fetch(
      `${baseUrl}/buckets/${bucket}/objects?key=${encodeURIComponent(key)}`,
      { method: "PUT", body: form }
    );
    const uploaded = await uploadResponse.json();

    const metadataResponse = await fetch(
      `${baseUrl}/buckets/${bucket}/objects/metadata?key=${encodeURIComponent(
        key
      )}`
    );
    const metadata = await metadataResponse.json();
    const parityShard = metadata.shards.find(
      (shard: { role: string }) => shard.role === "parity"
    );
    assert.ok(parityShard);

    const parityPath = path.join(dataRoot, "buckets", bucket, parityShard.path);
    await rm(parityPath, { force: true });
    assert.equal(await pathExists(parityPath), false);

    const response = await fetch(
      `${baseUrl}/buckets/${bucket}/objects?key=${encodeURIComponent(key)}`
    );
    assert.equal(response.status, 200);
    assert.equal(Buffer.from(await response.arrayBuffer()).toString(), body.toString());

    assert.equal(await pathExists(parityPath), false);
    assert.equal(uploaded.size, body.length);
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

test("metadata migration dry-run detects legacy objects without changing files", async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "shardstore-migration-"));

  try {
    const bucket = "photo-bucket";
    const legacy = await writeLegacyObject(dataRoot, bucket, {
      objectId: "11111111-1111-4111-8111-111111111111",
      key: "2026/06/sample.txt",
      body: Buffer.from("legacy object body")
    });
    await writeRawMetadata(dataRoot, bucket, "schema2", {
      schema_version: 2,
      object_id: "schema2",
      bucket,
      key: "legacy-sharded",
      storage_type: "sharded",
      shard_count: 3,
      shards: []
    });
    await writeRawMetadata(dataRoot, bucket, "schema3", {
      schema_version: 3,
      object_id: "schema3",
      bucket,
      key: "current",
      storage_type: "erasure_coded",
      coding: {},
      shards: [],
      created_at: new Date().toISOString()
    });

    const beforeMetadata = await readFile(legacy.metadataPath, "utf8");
    const service = new MetadataMigrationService(new LocalStorage(dataRoot));
    const report = await service.run({ dryRun: true });

    assert.equal(report.dry_run, true);
    assert.equal(report.scanned, 3);
    assert.equal(report.migratable, 1);
    assert.equal(report.skipped, 2);
    assert.equal(report.failed, 0);

    const migratable = report.items.find((item) => item.status === "migratable");
    assert.ok(migratable);
    assert.equal(migratable.from_schema_version, 1);
    assert.equal(migratable.to_schema_version, 3);
    assert.equal(migratable.to_storage_type, "erasure_coded");
    assert.deepEqual(migratable.planned_shards, [
      {
        index: 0,
        role: "data",
        tier: "hot",
        path: `shards/${legacy.objectId}/hot/shard_0.data`
      },
      {
        index: 1,
        role: "data",
        tier: "hot",
        path: `shards/${legacy.objectId}/hot/shard_1.data`
      },
      {
        index: 2,
        role: "parity",
        tier: "cold",
        path: `shards/${legacy.objectId}/cold/parity_0.data`
      }
    ]);
    assert.equal(await readFile(legacy.metadataPath, "utf8"), beforeMetadata);
    assert.equal(
      await pathExists(path.join(dataRoot, "buckets", bucket, "metadata", "backups")),
      false
    );
    assert.equal(
      await pathExists(path.join(dataRoot, "buckets", bucket, "shards", legacy.objectId)),
      false
    );

    const skipReasons = report.items
      .filter((item) => item.status === "skipped")
      .map((item) => item.reason)
      .sort();
    assert.deepEqual(skipReasons, [
      "already current schema",
      "unsupported migration source schema"
    ]);
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
});

test("metadata migration creates schema v3 hot/cold shards and migrated objects remain downloadable and recoverable", async () => {
  await withServer(async (baseUrl, dataRoot) => {
    const bucket = "photo-bucket";
    const key = "2026/06/migrated.txt";
    const body = Buffer.from("legacy data can move to erasure coded storage");
    const legacy = await writeLegacyObject(dataRoot, bucket, {
      objectId: "22222222-2222-4222-8222-222222222222",
      key,
      body
    });
    const beforeMetadata = JSON.parse(await readFile(legacy.metadataPath, "utf8"));

    const service = new MetadataMigrationService(new LocalStorage(dataRoot));
    const report = await service.run({ dryRun: false });

    assert.equal(report.dry_run, false);
    assert.equal(report.scanned, 1);
    assert.equal(report.migrated, 1);
    assert.equal(report.skipped, 0);
    assert.equal(report.failed, 0);

    const migrated = report.items[0];
    assert.equal(migrated.status, "migrated");
    assert.ok(migrated.status === "migrated");
    assert.equal(migrated.from_schema_version, 1);
    assert.equal(migrated.to_schema_version, 3);
    assert.equal(migrated.to_storage_type, "erasure_coded");

    const backupRoot = path.join(
      dataRoot,
      "buckets",
      bucket,
      "metadata",
      "backups",
      "migration"
    );
    const backupMetadataPath = await findSingleBackupFile(backupRoot);
    assert.deepEqual(
      JSON.parse(await readFile(backupMetadataPath, "utf8")),
      beforeMetadata
    );
    assert.equal(await pathExists(legacy.sourcePath), true);

    const metadata = JSON.parse(await readFile(legacy.metadataPath, "utf8"));
    assert.equal(metadata.schema_version, 3);
    assert.equal(metadata.storage_type, "erasure_coded");
    assert.deepEqual(metadata.coding, {
      algorithm: "reed-solomon",
      data_shards: 2,
      parity_shards: 1,
      total_shards: 3,
      recoverable_shard_loss: 1
    });
    assert.equal(metadata.migrated_from_schema_version, 1);
    assert.equal(typeof metadata.migrated_at, "string");
    assert.equal(metadata.shards.length, 3);
    assert.deepEqual(
      metadata.shards.map(
        (shard: { index: number; role: string; tier: string; path: string }) => ({
          index: shard.index,
          role: shard.role,
          tier: shard.tier,
          path: shard.path
        })
      ),
      [
        {
          index: 0,
          role: "data",
          tier: "hot",
          path: `shards/${legacy.objectId}/hot/shard_0.data`
        },
        {
          index: 1,
          role: "data",
          tier: "hot",
          path: `shards/${legacy.objectId}/hot/shard_1.data`
        },
        {
          index: 2,
          role: "parity",
          tier: "cold",
          path: `shards/${legacy.objectId}/cold/parity_0.data`
        }
      ]
    );

    for (const shard of metadata.shards) {
      const shardPath = path.join(dataRoot, "buckets", bucket, shard.path);
      const shardData = await readFile(shardPath);
      assert.equal(shardData.length, shard.size);
      assert.equal(createHash("sha256").update(shardData).digest("hex"), shard.checksum);
    }
    assert.equal(
      await pathExists(
        path.join(dataRoot, "buckets", bucket, "shards", legacy.objectId, "shard_0.data")
      ),
      false
    );

    let response = await fetch(
      `${baseUrl}/buckets/${bucket}/objects?key=${encodeURIComponent(key)}`
    );
    assert.equal(response.status, 200);
    assert.equal(Buffer.from(await response.arrayBuffer()).toString(), body.toString());

    await rm(
      path.join(
        dataRoot,
        "buckets",
        bucket,
        "shards",
        legacy.objectId,
        "hot",
        "shard_1.data"
      ),
      { force: true }
    );
    response = await fetch(`${baseUrl}/debug/objects/${legacy.objectId}/recover`, {
      method: "POST"
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object_id: legacy.objectId,
      recovered: true,
      recovered_shards: [
        {
          role: "data",
          tier: "hot",
          index: 1,
          path: `shards/${legacy.objectId}/hot/shard_1.data`
        }
      ],
      checksum_matched: true
    });

    response = await fetch(
      `${baseUrl}/buckets/${bucket}/objects?key=${encodeURIComponent(key)}`
    );
    assert.equal(response.status, 200);
    assert.equal(Buffer.from(await response.arrayBuffer()).toString(), body.toString());
  });
});

test("metadata migration failures keep legacy metadata and do not create shards", async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "shardstore-migration-fail-"));

  try {
    const bucket = "broken-bucket";
    const mismatch = await writeLegacyObject(dataRoot, bucket, {
      objectId: "33333333-3333-4333-8333-333333333333",
      key: "mismatch.bin",
      body: Buffer.from("original")
    });
    await writeFile(mismatch.sourcePath, "changed");
    const missing = await writeLegacyObject(dataRoot, bucket, {
      objectId: "44444444-4444-4444-8444-444444444444",
      key: "missing.bin",
      body: Buffer.from("missing")
    });
    await rm(missing.sourcePath, { force: true });

    const mismatchBefore = await readFile(mismatch.metadataPath, "utf8");
    const missingBefore = await readFile(missing.metadataPath, "utf8");
    const service = new MetadataMigrationService(new LocalStorage(dataRoot));
    const report = await service.run({ dryRun: false });

    assert.equal(report.scanned, 2);
    assert.equal(report.migrated, 0);
    assert.equal(report.failed, 2);
    assert.deepEqual(
      report.items.map((item) => item.status === "failed" && item.reason).sort(),
      ["checksum mismatch", "source object file not found"]
    );
    assert.equal(await readFile(mismatch.metadataPath, "utf8"), mismatchBefore);
    assert.equal(await readFile(missing.metadataPath, "utf8"), missingBefore);
    assert.equal(
      await pathExists(path.join(dataRoot, "buckets", bucket, "shards", mismatch.objectId)),
      false
    );
    assert.equal(
      await pathExists(path.join(dataRoot, "buckets", bucket, "shards", missing.objectId)),
      false
    );
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
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

async function writeLegacyObject(
  dataRoot: string,
  bucket: string,
  options: { objectId: string; key: string; body: Buffer }
) {
  const bucketRoot = path.join(dataRoot, "buckets", bucket);
  const metadataDir = path.join(bucketRoot, "metadata", "objects");
  const objectsDir = path.join(bucketRoot, "objects");
  await mkdir(metadataDir, { recursive: true });
  await mkdir(objectsDir, { recursive: true });

  const sourcePath = path.join(objectsDir, `${options.objectId}.data`);
  await writeFile(sourcePath, options.body);

  const metadataPath = path.join(metadataDir, `${options.objectId}.json`);
  const metadata = {
    schema_version: 1,
    object_id: options.objectId,
    bucket,
    key: options.key,
    original_file_name: path.basename(options.key),
    content_type: "application/octet-stream",
    size: options.body.length,
    checksum: createHash("sha256").update(options.body).digest("hex"),
    storage_path: `objects/${options.objectId}.data`,
    created_at: "2026-06-10T12:00:00.000Z"
  };
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  return {
    objectId: options.objectId,
    sourcePath,
    metadataPath
  };
}

async function writeRawMetadata(
  dataRoot: string,
  bucket: string,
  objectId: string,
  metadata: Record<string, unknown>
) {
  const metadataDir = path.join(dataRoot, "buckets", bucket, "metadata", "objects");
  await mkdir(metadataDir, { recursive: true });
  await writeFile(
    path.join(metadataDir, `${objectId}.json`),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8"
  );
}

async function findSingleBackupFile(backupRoot: string) {
  const timestampDirs = await readdir(backupRoot);
  assert.equal(timestampDirs.length, 1);
  const backupDir = path.join(backupRoot, timestampDirs[0]);
  const files = await readdir(backupDir);
  assert.equal(files.length, 1);
  return path.join(backupDir, files[0]);
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
