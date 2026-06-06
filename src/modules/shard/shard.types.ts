export interface ShardWriteResult {
  index: number;
  path: string;
  size: number;
  checksum: string;
}

export interface ShardReadDescriptor {
  index: number;
  checksum: string;
}
