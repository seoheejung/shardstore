import { sha256 } from "../checksum/sha256";
import {
  DATA_SHARDS,
  ErasureService,
  PARITY_SHARDS,
  RECOVERABLE_SHARD_LOSS,
  TOTAL_SHARDS
} from "../erasure/erasure.service";
import { ObjectMetadata } from "../metadata/metadata.types";
import { LocalStorage } from "../storage/local-storage";
import { AppError } from "../../shared/errors";
import { ShardReadDescriptor, ShardWriteResult } from "./shard.types";

export {
  DATA_SHARDS,
  PARITY_SHARDS,
  RECOVERABLE_SHARD_LOSS,
  TOTAL_SHARDS
};

export class ShardService {
  constructor(
    private readonly storage: LocalStorage,
    private readonly erasureService: ErasureService = new ErasureService()
  ) {}

  async writeShards(
    bucketName: string,
    objectId: string,
    data: Buffer
  ): Promise<ShardWriteResult[]> {
    const encoded = this.erasureService.encode(data);
    const shards: ShardWriteResult[] = [];

    for (const [index, shard] of encoded.data.entries()) {
      const storagePath = this.storage.objectDataShardStoragePath(objectId, index);
      await this.storage.writeObjectShardByPath(bucketName, storagePath, shard);
      shards.push({
        index,
        role: "data",
        tier: "hot",
        path: storagePath,
        size: shard.length,
        checksum: sha256(shard)
      });
    }

    for (const [parityIndex, shard] of encoded.parity.entries()) {
      const storagePath = this.storage.objectParityShardStoragePath(
        objectId,
        parityIndex
      );
      await this.storage.writeObjectShardByPath(bucketName, storagePath, shard);
      shards.push({
        index: DATA_SHARDS + parityIndex,
        role: "parity",
        tier: "cold",
        path: storagePath,
        size: shard.length,
        checksum: sha256(shard)
      });
    }

    return shards;
  }

  async readObject(metadata: ObjectMetadata) {
    await this.recoverMissingShards(metadata);
    return this.readDataShards(metadata);
  }

  async recoverMissingShards(metadata: ObjectMetadata) {
    const shardData = await this.readAvailableShards(metadata);
    const missingShards = metadata.shards.filter(
      (shard) => shardData[shard.index] === null
    );

    if (missingShards.length === 0) {
      return [];
    }

    const recoveredBuffers = this.erasureService.recover(shardData);
    const recoveredShards: ShardReadDescriptor[] = [];

    for (const shard of missingShards) {
      const recovered = recoveredBuffers[shard.index];
      if (sha256(recovered) !== shard.checksum) {
        throw new AppError(
          500,
          "checksum_mismatch",
          "Recovered shard checksum does not match metadata"
        );
      }

      // Recovery writes the rebuilt shard back to its original hot/cold tier.
      await this.storage.writeObjectShardByPath(
        metadata.bucket,
        shard.path,
        recovered
      );
      recoveredShards.push(shard);
    }

    return recoveredShards;
  }

  private async readDataShards(metadata: ObjectMetadata) {
    const buffers: Buffer[] = [];

    for (const shard of metadata.shards
      .filter((item) => item.role === "data")
      .sort((a, b) => a.index - b.index)) {
      const data = await this.storage.readObjectShardByPath(
        metadata.bucket,
        shard.path
      );

      if (sha256(data) !== shard.checksum) {
        throw new AppError(
          500,
          "checksum_mismatch",
          "Stored shard checksum does not match metadata"
        );
      }

      buffers.push(data);
    }

    // Erasure shards are padded to equal size; metadata.size defines the object.
    return Buffer.concat(buffers).subarray(0, metadata.size);
  }

  private async readAvailableShards(metadata: ObjectMetadata) {
    const shardData: Array<Buffer | null> = Array.from(
      { length: TOTAL_SHARDS },
      () => null
    );

    for (const shard of metadata.shards) {
      try {
        const data = await this.storage.readObjectShardByPath(
          metadata.bucket,
          shard.path
        );

        if (sha256(data) !== shard.checksum) {
          throw new AppError(
            500,
            "checksum_mismatch",
            "Stored shard checksum does not match metadata"
          );
        }

        shardData[shard.index] = data;
      } catch (error) {
        if (isNotFound(error)) {
          continue;
        }
        throw error;
      }
    }

    return shardData;
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
