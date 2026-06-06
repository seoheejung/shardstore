export interface ObjectShardMetadata {
  index: number;
  path: string;
  size: number;
  checksum: string;
}

export interface ObjectMetadata {
  schema_version: 2;
  object_id: string;
  bucket: string;
  key: string;
  original_file_name: string;
  content_type: string;
  size: number;
  checksum: string;
  storage_type: "sharded";
  shard_count: number;
  shards: ObjectShardMetadata[];
  created_at: string;
}
