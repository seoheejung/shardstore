import { sha256 } from "../checksum/sha256";
import { MetadataRepository } from "../metadata/metadata.repository";
import { ObjectMetadata, ObjectShardMetadata } from "../metadata/metadata.types";
import { ShardService } from "../shard/shard.service";
import { LocalStorage } from "../storage/local-storage";
import { AppError } from "../../shared/errors";

export class DebugService {
  constructor(
    private readonly storage: LocalStorage,
    private readonly metadataRepository: MetadataRepository,
    private readonly shardService: ShardService = new ShardService(storage)
  ) {}

  async deleteShards(objectId: string, rawCount: unknown) {
    const metadata = await this.getMetadata(objectId);
    const count = parseDeleteCount(rawCount);
    const existingShards = await this.getExistingShards(metadata);
    const selected = existingShards
      .sort(compareDeletionPriority)
      .slice(0, count);

    for (const shard of selected) {
      await this.storage.deleteObjectShardByPath(metadata.bucket, shard.path);
    }

    return {
      object_id: metadata.object_id,
      deleted_count: selected.length,
      deleted_shards: selected.map(toDebugShard)
    };
  }

  async recover(objectId: string) {
    const metadata = await this.getMetadata(objectId);
    const recoveredShards = await this.shardService.recoverMissingShards(metadata);
    const data = await this.shardService.readObject(metadata);
    const checksumMatched = sha256(data) === metadata.checksum;

    if (!checksumMatched) {
      throw new AppError(
        500,
        "checksum_mismatch",
        "Recovered object checksum does not match metadata"
      );
    }

    if (recoveredShards.length === 0) {
      return {
        object_id: metadata.object_id,
        recovered: false,
        missing_count: 0,
        checksum_matched: true
      };
    }

    return {
      object_id: metadata.object_id,
      recovered: true,
      recovered_shards: recoveredShards.map(toDebugShard),
      checksum_matched: true
    };
  }

  private async getMetadata(objectId: string) {
    const metadata = await this.metadataRepository.findByObjectId(objectId);
    if (!metadata) {
      throw new AppError(404, "object_not_found", "Object not found");
    }

    return metadata;
  }

  private async getExistingShards(metadata: ObjectMetadata) {
    const existing: ObjectShardMetadata[] = [];

    for (const shard of metadata.shards) {
      try {
        await this.storage.readObjectShardByPath(metadata.bucket, shard.path);
        existing.push(shard);
      } catch (error) {
        if (isNotFound(error)) {
          continue;
        }
        throw error;
      }
    }

    return existing;
  }
}

function parseDeleteCount(rawCount: unknown) {
  if (rawCount === undefined) {
    return 1;
  }

  const count = Number(rawCount);
  if (!Number.isInteger(count) || count < 1) {
    throw new AppError(400, "invalid_count", "count must be a positive integer");
  }

  return count;
}

function compareDeletionPriority(
  left: ObjectShardMetadata,
  right: ObjectShardMetadata
) {
  // Prefer data shards first so count=1 exercises data recovery deterministically.
  if (left.role !== right.role) {
    return left.role === "data" ? -1 : 1;
  }

  return right.index - left.index;
}

function toDebugShard(shard: ObjectShardMetadata) {
  return {
    role: shard.role,
    tier: shard.tier,
    index: shard.index,
    path: shard.path
  };
}

function isNotFound(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
