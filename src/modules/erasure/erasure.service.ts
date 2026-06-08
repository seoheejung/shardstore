import { AppError } from "../../shared/errors";
import { EncodedErasureShards } from "./erasure.types";

export const DATA_SHARDS = 2;
export const PARITY_SHARDS = 1;
export const TOTAL_SHARDS = DATA_SHARDS + PARITY_SHARDS;
export const RECOVERABLE_SHARD_LOSS = 1;

export class ErasureService {
  encode(data: Buffer): EncodedErasureShards {
    const shardSize = Math.ceil(data.length / DATA_SHARDS);
    const dataShards = Array.from({ length: DATA_SHARDS }, (_, index) => {
      const shard = Buffer.alloc(shardSize);
      data.copy(shard, 0, index * shardSize, (index + 1) * shardSize);
      return shard;
    });

    return {
      data: dataShards,
      parity: [xorBuffers(dataShards)]
    };
  }

  recover(shards: Array<Buffer | null>): Buffer[] {
    const missingIndexes = shards
      .map((shard, index) => (shard === null ? index : -1))
      .filter((index) => index >= 0);

    if (missingIndexes.length > RECOVERABLE_SHARD_LOSS) {
      throw new AppError(
        500,
        "too_many_missing_shards",
        "too many missing shards to recover",
        {
          missing_count: missingIndexes.length,
          recoverable_shard_loss: RECOVERABLE_SHARD_LOSS
        }
      );
    }

    if (missingIndexes.length === 0) {
      return shards as Buffer[];
    }

    const recovered = [...shards] as Array<Buffer | null>;
    const missingIndex = missingIndexes[0];

    // With k=2,m=1, the Reed-Solomon parity row is equivalent to XOR parity.
    if (missingIndex === DATA_SHARDS) {
      recovered[DATA_SHARDS] = xorBuffers(recovered.slice(0, DATA_SHARDS) as Buffer[]);
      return recovered as Buffer[];
    }

    const parity = recovered[DATA_SHARDS];
    const otherData = recovered[missingIndex === 0 ? 1 : 0];
    if (!parity || !otherData) {
      throw new AppError(
        500,
        "too_many_missing_shards",
        "too many missing shards to recover",
        {
          missing_count: missingIndexes.length,
          recoverable_shard_loss: RECOVERABLE_SHARD_LOSS
        }
      );
    }

    recovered[missingIndex] = xorBuffers([parity, otherData]);
    return recovered as Buffer[];
  }
}

function xorBuffers(buffers: Buffer[]) {
  const maxLength = Math.max(0, ...buffers.map((buffer) => buffer.length));
  const output = Buffer.alloc(maxLength);

  for (const buffer of buffers) {
    for (let index = 0; index < buffer.length; index += 1) {
      output[index] ^= buffer[index];
    }
  }

  return output;
}
