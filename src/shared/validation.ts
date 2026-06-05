import { AppError } from "./errors";

const bucketNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/;

export function validateBucketName(bucketName: string): string {
  if (!bucketNamePattern.test(bucketName) || bucketName.includes("..")) {
    throw new AppError(
      400,
      "invalid_bucket_name",
      "Bucket name must be a safe local directory name"
    );
  }

  return bucketName;
}

export function requireObjectKey(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new AppError(400, "missing_object_key", "Object key is required");
  }

  if (value.length > 1024 || /[\u0000-\u001f]/.test(value)) {
    throw new AppError(400, "invalid_object_key", "Object key is invalid");
  }

  return value;
}
