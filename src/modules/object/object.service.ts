import { randomUUID } from "crypto";

import { sha256 } from "../checksum/sha256";
import { MetadataRepository } from "../metadata/metadata.repository";
import { ObjectMetadata } from "../metadata/metadata.types";
import { LocalStorage } from "../storage/local-storage";
import { AppError } from "../../shared/errors";
import { requireObjectKey, validateBucketName } from "../../shared/validation";
import { BucketService } from "../bucket/bucket.service";

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export class ObjectService {
  constructor(
    private readonly bucketService: BucketService,
    private readonly storage: LocalStorage,
    private readonly metadataRepository: MetadataRepository
  ) {}

  async upload(bucketName: string, rawKey: unknown, file?: UploadedFile) {
    const bucket = validateBucketName(bucketName);
    const key = requireObjectKey(rawKey);
    await this.bucketService.get(bucket);

    if (!file) {
      throw new AppError(400, "missing_file", "Multipart field 'file' is required");
    }

    if (await this.metadataRepository.findByKey(bucket, key)) {
      throw new AppError(409, "object_already_exists", "Object key already exists");
    }

    const objectId = randomUUID();
    const checksum = sha256(file.buffer);
    const metadata: ObjectMetadata = {
      schema_version: 1,
      object_id: objectId,
      bucket,
      key,
      original_file_name: file.originalname,
      content_type: file.mimetype || "application/octet-stream",
      size: file.size,
      checksum,
      storage_path: `objects/${objectId}.data`,
      created_at: new Date().toISOString()
    };

    await this.storage.writeObjectData(bucket, objectId, file.buffer);

    try {
      await this.metadataRepository.save(metadata);
    } catch (error) {
      await this.storage.deleteObjectData(bucket, objectId);
      throw error;
    }

    return {
      object_id: objectId,
      bucket,
      key,
      size: metadata.size,
      checksum
    };
  }

  async getMetadata(bucketName: string, rawKey: unknown) {
    const bucket = validateBucketName(bucketName);
    const key = requireObjectKey(rawKey);
    await this.bucketService.get(bucket);

    const metadata = await this.metadataRepository.findByKey(bucket, key);
    if (!metadata) {
      throw new AppError(404, "object_not_found", "Object not found");
    }

    return metadata;
  }

  async download(bucketName: string, rawKey: unknown) {
    const metadata = await this.getMetadata(bucketName, rawKey);
    const data = await this.storage.readObjectData(
      metadata.bucket,
      metadata.object_id
    );

    if (sha256(data) !== metadata.checksum) {
      throw new AppError(
        500,
        "checksum_mismatch",
        "Stored object checksum does not match metadata"
      );
    }

    return { metadata, data };
  }

  async list(bucketName: string) {
    const bucket = validateBucketName(bucketName);
    await this.bucketService.get(bucket);
    const objects = await this.metadataRepository.list(bucket);

    return {
      objects: objects.map((metadata) => ({
        object_id: metadata.object_id,
        key: metadata.key,
        size: metadata.size,
        checksum: metadata.checksum,
        created_at: metadata.created_at
      }))
    };
  }

  async delete(bucketName: string, rawKey: unknown) {
    const metadata = await this.getMetadata(bucketName, rawKey);
    await this.storage.deleteObjectData(metadata.bucket, metadata.object_id);
    await this.storage.deleteObjectMetadata(metadata.bucket, metadata.object_id);

    return {
      deleted: true,
      bucket: metadata.bucket,
      key: metadata.key
    };
  }
}
