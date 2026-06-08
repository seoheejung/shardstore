import { ShardRole, ShardTier } from "../shard/shard.types";

export interface ObjectShardMetadata {
  index: number;
  role: ShardRole;
  tier: ShardTier;
  path: string;
  size: number;
  checksum: string;
}

export interface ObjectCodingMetadata {
  algorithm: "reed-solomon";
  data_shards: number;
  parity_shards: number;
  total_shards: number;
  recoverable_shard_loss: number;
}

export interface ObjectMetadata {
  schema_version: 3;
  object_id: string;
  bucket: string;
  key: string;
  original_file_name: string;
  content_type: string;
  size: number;
  checksum: string;
  storage_type: "erasure_coded";
  coding: ObjectCodingMetadata;
  shards: ObjectShardMetadata[];
  created_at: string;
}
