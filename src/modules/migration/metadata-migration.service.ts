import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "fs/promises";
import path from "path";

import { sha256 } from "../checksum/sha256";
import { ObjectMetadata } from "../metadata/metadata.types";
import {
  DATA_SHARDS,
  PARITY_SHARDS,
  RECOVERABLE_SHARD_LOSS,
  ShardService,
  TOTAL_SHARDS
} from "../shard/shard.service";
import { LocalStorage } from "../storage/local-storage";
import {
  MetadataMigrationFailedItem,
  MetadataMigrationItem,
  MetadataMigrationOptions,
  MetadataMigrationReport,
  MetadataMigrationShardPreview
} from "./metadata-migration.types";

interface LegacyObjectMetadata {
  schema_version: 1;
  object_id: string;
  bucket: string;
  key: string;
  original_file_name?: string;
  content_type?: string;
  size: number;
  checksum: string;
  storage_path: string;
  created_at?: string;
}

interface MetadataFile {
  bucket: string;
  filePath: string;
}

export class MetadataMigrationService {
  constructor(
    private readonly storage: LocalStorage = new LocalStorage(),
    private readonly shardService: ShardService = new ShardService(storage)
  ) {}

  async run(options: MetadataMigrationOptions): Promise<MetadataMigrationReport> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const files = await this.listMetadataFiles();
    const items: MetadataMigrationItem[] = [];
    const backupDirs = new Set<string>();

    for (const file of files) {
      items.push(await this.processFile(file, options.dryRun, timestamp, backupDirs));
    }

    const skipped = items.filter((item) => item.status === "skipped").length;
    const failed = items.filter((item) => item.status === "failed").length;
    const backupDirList = [...backupDirs].sort();

    if (options.dryRun) {
      return {
        dry_run: true,
        scanned: files.length,
        migratable: items.filter((item) => item.status === "migratable").length,
        skipped,
        failed,
        items
      };
    }

    return {
      dry_run: false,
      scanned: files.length,
      migrated: items.filter((item) => item.status === "migrated").length,
      skipped,
      failed,
      ...(backupDirList.length === 1 ? { backup_dir: backupDirList[0] } : {}),
      ...(backupDirList.length > 0 ? { backup_dirs: backupDirList } : {}),
      items
    };
  }

  private async listMetadataFiles(): Promise<MetadataFile[]> {
    const files: MetadataFile[] = [];
    const buckets = await this.storage.listBuckets();

    for (const bucket of buckets) {
      const metadataDir = path.join(
        this.storage.bucketPath(bucket),
        "metadata",
        "objects"
      );

      let entries: string[];
      try {
        entries = await readdir(metadataDir);
      } catch (error) {
        if (isNotFound(error)) {
          continue;
        }
        throw error;
      }

      for (const entry of entries.filter((fileName) => fileName.endsWith(".json"))) {
        files.push({ bucket, filePath: path.join(metadataDir, entry) });
      }
    }

    return files.sort((left, right) => left.filePath.localeCompare(right.filePath));
  }

  private async processFile(
    file: MetadataFile,
    dryRun: boolean,
    timestamp: string,
    backupDirs: Set<string>
  ): Promise<MetadataMigrationItem> {
    let raw: unknown;

    try {
      raw = JSON.parse(await readFile(file.filePath, "utf8"));
    } catch {
      return {
        status: "failed",
        reason: "metadata JSON parse failed",
        metadata_path: file.filePath
      };
    }

    if (!isRecord(raw)) {
      return this.failed(raw, "metadata must be a JSON object", file.filePath);
    }

    const schemaVersion = raw.schema_version;
    if (schemaVersion === 2) {
      return this.skipped(raw, "unsupported migration source schema");
    }

    if (schemaVersion === 3) {
      return this.skipped(raw, "already current schema");
    }

    if (schemaVersion !== 1) {
      return this.failed(raw, "unsupported migration source schema", file.filePath);
    }

    const legacy = this.parseLegacy(raw, file.bucket, file.filePath);
    if (!("metadata" in legacy)) {
      return legacy;
    }

    const sourcePath = this.sourceObjectPath(legacy.metadata);
    let sourceData: Buffer;
    try {
      sourceData = await readFile(sourcePath);
    } catch (error) {
      if (isNotFound(error)) {
        return {
          object_id: legacy.metadata.object_id,
          bucket: legacy.metadata.bucket,
          key: legacy.metadata.key,
          schema_version: 1,
          status: "failed",
          reason: "source object file not found",
          storage_path: legacy.metadata.storage_path
        };
      }
      throw error;
    }

    const actualChecksum = sha256(sourceData);
    if (actualChecksum !== legacy.metadata.checksum) {
      return {
        object_id: legacy.metadata.object_id,
        bucket: legacy.metadata.bucket,
        key: legacy.metadata.key,
        schema_version: 1,
        status: "failed",
        reason: "checksum mismatch",
        expected_checksum: legacy.metadata.checksum,
        actual_checksum: actualChecksum
      };
    }

    const plannedShards = this.plannedShards(legacy.metadata.object_id);
    if (dryRun) {
      return {
        object_id: legacy.metadata.object_id,
        bucket: legacy.metadata.bucket,
        key: legacy.metadata.key,
        from_schema_version: 1,
        to_schema_version: 3,
        to_storage_type: "erasure_coded",
        status: "migratable",
        planned_shards: plannedShards
      };
    }

    const backupDir = this.backupDir(legacy.metadata.bucket, timestamp);
    const backupPath = path.join(backupDir, `${legacy.metadata.object_id}.json`);

    try {
      // Backup is byte-for-byte copied before any active metadata is replaced.
      await mkdir(backupDir, { recursive: true });
      await copyFile(file.filePath, backupPath);
      backupDirs.add(toReportPath(backupDir));

      const shards = await this.shardService.writeShards(
        legacy.metadata.bucket,
        legacy.metadata.object_id,
        sourceData
      );
      const migratedAt = new Date().toISOString();
      const targetMetadata = this.toTargetMetadata(
        legacy.metadata,
        shards,
        migratedAt
      );

      await this.replaceMetadataAtomically(file.filePath, targetMetadata);

      return {
        object_id: legacy.metadata.object_id,
        bucket: legacy.metadata.bucket,
        key: legacy.metadata.key,
        from_schema_version: 1,
        to_schema_version: 3,
        to_storage_type: "erasure_coded",
        status: "migrated",
        backup_path: toReportPath(backupPath),
        created_shards: shards
      };
    } catch (error) {
      await this.storage.deleteObjectShards(
        legacy.metadata.bucket,
        legacy.metadata.object_id
      );
      return {
        object_id: legacy.metadata.object_id,
        bucket: legacy.metadata.bucket,
        key: legacy.metadata.key,
        schema_version: 1,
        status: "failed",
        reason: error instanceof Error ? error.message : "migration failed"
      };
    }
  }

  private parseLegacy(
    raw: Record<string, unknown>,
    bucketFromPath: string,
    metadataPath: string
  ): { metadata: LegacyObjectMetadata } | MetadataMigrationFailedItem {
    const objectId = readString(raw.object_id);
    const bucket = readString(raw.bucket);
    const key = readString(raw.key);
    const size = readNumber(raw.size);
    const checksum = readString(raw.checksum);
    const storagePath = readString(raw.storage_path);

    if (!objectId || !bucket || !key || size === null || !checksum || !storagePath) {
      return this.failed(raw, "required legacy metadata field missing", metadataPath);
    }

    if (bucket !== bucketFromPath) {
      return this.failed(raw, "metadata bucket does not match bucket path", metadataPath);
    }

    const expectedStoragePath = path.posix.join("objects", `${objectId}.data`);
    if (path.posix.normalize(storagePath) !== expectedStoragePath) {
      return {
        object_id: objectId,
        bucket,
        key,
        schema_version: 1,
        status: "failed",
        reason: "invalid storage_path",
        storage_path: storagePath
      };
    }

    return {
      metadata: {
        schema_version: 1,
        object_id: objectId,
        bucket,
        key,
        original_file_name: readString(raw.original_file_name) ?? key,
        content_type: readString(raw.content_type) ?? "application/octet-stream",
        size,
        checksum,
        storage_path: storagePath,
        created_at: readString(raw.created_at) ?? new Date().toISOString()
      }
    };
  }

  private sourceObjectPath(metadata: LegacyObjectMetadata) {
    const normalized = path.posix.normalize(metadata.storage_path);
    return path.join(this.storage.bucketPath(metadata.bucket), ...normalized.split("/"));
  }

  private plannedShards(objectId: string): MetadataMigrationShardPreview[] {
    return [
      {
        index: 0,
        role: "data",
        tier: "hot",
        path: this.storage.objectDataShardStoragePath(objectId, 0)
      },
      {
        index: 1,
        role: "data",
        tier: "hot",
        path: this.storage.objectDataShardStoragePath(objectId, 1)
      },
      {
        index: DATA_SHARDS,
        role: "parity",
        tier: "cold",
        path: this.storage.objectParityShardStoragePath(objectId, 0)
      }
    ];
  }

  private toTargetMetadata(
    legacy: LegacyObjectMetadata,
    shards: ObjectMetadata["shards"],
    migratedAt: string
  ): ObjectMetadata {
    return {
      schema_version: 3,
      object_id: legacy.object_id,
      bucket: legacy.bucket,
      key: legacy.key,
      original_file_name: legacy.original_file_name ?? legacy.key,
      content_type: legacy.content_type ?? "application/octet-stream",
      size: legacy.size,
      checksum: legacy.checksum,
      storage_type: "erasure_coded",
      coding: {
        algorithm: "reed-solomon",
        data_shards: DATA_SHARDS,
        parity_shards: PARITY_SHARDS,
        total_shards: TOTAL_SHARDS,
        recoverable_shard_loss: RECOVERABLE_SHARD_LOSS
      },
      shards,
      migrated_from_schema_version: 1,
      migrated_at: migratedAt,
      created_at: legacy.created_at ?? migratedAt
    };
  }

  private async replaceMetadataAtomically(
    metadataPath: string,
    metadata: ObjectMetadata
  ) {
    const tempPath = `${metadataPath}.tmp-${process.pid}`;
    try {
      await writeFile(tempPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
      await rename(tempPath, metadataPath);
    } catch (error) {
      await rm(tempPath, { force: true });
      throw error;
    }
  }

  private backupDir(bucketName: string, timestamp: string) {
    return path.join(
      this.storage.bucketPath(bucketName),
      "metadata",
      "backups",
      "migration",
      timestamp
    );
  }

  private skipped(raw: Record<string, unknown>, reason: string) {
    return {
      object_id: readString(raw.object_id),
      bucket: readString(raw.bucket),
      key: readString(raw.key),
      schema_version: raw.schema_version,
      status: "skipped" as const,
      reason
    };
  }

  private failed(
    raw: unknown,
    reason: string,
    metadataPath: string
  ): MetadataMigrationFailedItem {
    const record = isRecord(raw) ? raw : {};
    return {
      object_id: readString(record.object_id),
      bucket: readString(record.bucket),
      key: readString(record.key),
      schema_version: record.schema_version,
      status: "failed",
      reason,
      metadata_path: metadataPath
    };
  }
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotFound(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function toReportPath(filePath: string) {
  return path.relative(process.cwd(), filePath).split(path.sep).join("/");
}
