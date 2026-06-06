import { sha256 } from "../checksum/sha256";
import { LocalStorage } from "../storage/local-storage";
import { AppError } from "../../shared/errors";
import { ShardReadDescriptor, ShardWriteResult } from "./shard.types";

export const SHARD_COUNT = 3;

export class ShardService {
  constructor(private readonly storage: LocalStorage) {}

  async writeShards(
    bucketName: string,
    objectId: string,
    data: Buffer
  ): Promise<ShardWriteResult[]> {
    const shardBuffers = splitIntoShards(data, SHARD_COUNT);
    const shards: ShardWriteResult[] = [];

    for (const [index, shard] of shardBuffers.entries()) {
      await this.storage.writeObjectShard(bucketName, objectId, index, shard);
      shards.push({
        index,
        path: this.storage.objectShardStoragePath(objectId, index),
        size: shard.length,
        checksum: sha256(shard)
      });
    }

    return shards;
  }

  async readShards(
    bucketName: string,
    objectId: string,
    descriptors: ShardReadDescriptor[]
  ) {
    const buffers: Buffer[] = [];

    // Metadata order is not trusted; index order defines the restored object.
    for (const shard of [...descriptors].sort((a, b) => a.index - b.index)) {
      const data = await this.storage.readObjectShard(bucketName, objectId, shard.index);

      if (sha256(data) !== shard.checksum) {
        throw new AppError(
          500,
          "checksum_mismatch",
          "Stored shard checksum does not match metadata"
        );
      }

      buffers.push(data);
    }

    return Buffer.concat(buffers);
  }
}

function splitIntoShards(data: Buffer, shardCount: number) {
  const baseSize = Math.floor(data.length / shardCount);
  const remainder = data.length % shardCount;
  const shards: Buffer[] = [];
  let offset = 0;

  for (let index = 0; index < shardCount; index += 1) {
    const shardSize = baseSize + (index < remainder ? 1 : 0);
    shards.push(data.subarray(offset, offset + shardSize));
    offset += shardSize;
  }

  return shards;
}
