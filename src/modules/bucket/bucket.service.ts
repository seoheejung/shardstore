import { access } from "fs/promises";

import { LocalStorage } from "../storage/local-storage";
import { AppError } from "../../shared/errors";
import { validateBucketName } from "../../shared/validation";

export class BucketService {
  constructor(private readonly storage: LocalStorage) {}

  async create(bucketName: string) {
    const bucket = validateBucketName(bucketName);
    const exists = await this.exists(bucket);
    await this.storage.ensureBucket(bucket);
    return { bucket, created: !exists };
  }

  async get(bucketName: string) {
    const bucket = validateBucketName(bucketName);
    if (!(await this.exists(bucket))) {
      throw new AppError(404, "bucket_not_found", "Bucket not found");
    }

    return { bucket, exists: true as const };
  }

  async list() {
    return { buckets: await this.storage.listBuckets() };
  }

  async exists(bucketName: string) {
    try {
      await access(this.storage.bucketPath(bucketName));
      return true;
    } catch (error) {
      if (isNotFound(error)) {
        return false;
      }
      throw error;
    }
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
