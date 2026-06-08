export type ShardRole = "data" | "parity";
export type ShardTier = "hot" | "cold";

export interface ShardWriteResult {
  index: number;
  role: ShardRole;
  tier: ShardTier;
  path: string;
  size: number;
  checksum: string;
}

export interface ShardReadDescriptor {
  index: number;
  role: ShardRole;
  tier: ShardTier;
  path: string;
  size: number;
  checksum: string;
}
