import { ObjectShardMetadata } from "../metadata/metadata.types";

export interface MetadataMigrationOptions {
  dryRun: boolean;
}

export type MetadataMigrationItem =
  | MetadataMigrationMigratableItem
  | MetadataMigrationMigratedItem
  | MetadataMigrationSkippedItem
  | MetadataMigrationFailedItem;

export interface MetadataMigrationMigratableItem {
  object_id: string;
  bucket: string;
  key: string;
  from_schema_version: 1;
  to_schema_version: 3;
  to_storage_type: "erasure_coded";
  status: "migratable";
  planned_shards: MetadataMigrationShardPreview[];
}

export interface MetadataMigrationMigratedItem {
  object_id: string;
  bucket: string;
  key: string;
  from_schema_version: 1;
  to_schema_version: 3;
  to_storage_type: "erasure_coded";
  status: "migrated";
  backup_path: string;
  created_shards: ObjectShardMetadata[];
}

export interface MetadataMigrationSkippedItem {
  object_id?: string;
  bucket?: string;
  key?: string;
  schema_version?: unknown;
  status: "skipped";
  reason: string;
}

export interface MetadataMigrationFailedItem {
  object_id?: string;
  bucket?: string;
  key?: string;
  schema_version?: unknown;
  status: "failed";
  reason: string;
  storage_path?: string;
  expected_checksum?: string;
  actual_checksum?: string;
  metadata_path?: string;
}

export interface MetadataMigrationShardPreview {
  index: number;
  role: "data" | "parity";
  tier: "hot" | "cold";
  path: string;
}

export interface MetadataMigrationReport {
  dry_run: boolean;
  scanned: number;
  migratable?: number;
  migrated?: number;
  skipped: number;
  failed: number;
  backup_dir?: string;
  backup_dirs?: string[];
  items: MetadataMigrationItem[];
}

