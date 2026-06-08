import { mkdir, readFile, readdir, rm, writeFile } from "fs/promises";
import path from "path";

import { AppError } from "../../shared/errors";

export class LocalStorage {
  public readonly rootPath: string;

  constructor(rootPath = path.resolve(process.cwd(), "data")) {
    this.rootPath = rootPath;
  }

  bucketsPath() {
    return path.join(this.rootPath, "buckets");
  }

  bucketPath(bucketName: string) {
    return path.join(this.bucketsPath(), bucketName);
  }

  objectShardDirectoryPath(bucketName: string, objectId: string) {
    return path.join(this.bucketPath(bucketName), "shards", objectId);
  }

  objectShardDataPath(bucketName: string, objectId: string, shardIndex: number) {
    return path.join(
      this.objectShardDirectoryPath(bucketName, objectId),
      `shard_${shardIndex}.data`
    );
  }

  objectDataShardStoragePath(objectId: string, shardIndex: number) {
    return path.posix.join("shards", objectId, "hot", `shard_${shardIndex}.data`);
  }

  objectParityShardStoragePath(objectId: string, parityIndex: number) {
    return path.posix.join(
      "shards",
      objectId,
      "cold",
      `parity_${parityIndex}.data`
    );
  }

  objectShardStoragePath(objectId: string, shardIndex: number) {
    return path.posix.join("shards", objectId, `shard_${shardIndex}.data`);
  }

  objectShardPath(bucketName: string, storagePath: string) {
    const normalized = path.posix.normalize(storagePath);
    if (
      path.posix.isAbsolute(storagePath) ||
      normalized === ".." ||
      normalized.startsWith("../") ||
      !normalized.startsWith("shards/")
    ) {
      throw new AppError(500, "invalid_storage_path", "Invalid shard storage path");
    }

    return path.join(this.bucketPath(bucketName), ...normalized.split("/"));
  }

  objectMetadataPath(bucketName: string, objectId: string) {
    return path.join(
      this.bucketPath(bucketName),
      "metadata",
      "objects",
      `${objectId}.json`
    );
  }

  async ensureRoot() {
    await mkdir(this.bucketsPath(), { recursive: true });
  }

  async ensureBucket(bucketName: string) {
    await mkdir(path.join(this.bucketPath(bucketName), "shards"), {
      recursive: true
    });
    await mkdir(path.join(this.bucketPath(bucketName), "metadata", "objects"), {
      recursive: true
    });
  }

  async listBuckets() {
    await this.ensureRoot();
    const entries = await readdir(this.bucketsPath(), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  }

  async writeObjectShard(
    bucketName: string,
    objectId: string,
    shardIndex: number,
    data: Buffer
  ) {
    await mkdir(this.objectShardDirectoryPath(bucketName, objectId), {
      recursive: true
    });
    await writeFile(this.objectShardDataPath(bucketName, objectId, shardIndex), data);
  }

  async writeObjectShardByPath(
    bucketName: string,
    storagePath: string,
    data: Buffer
  ) {
    const filePath = this.objectShardPath(bucketName, storagePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
  }

  async readObjectShard(bucketName: string, objectId: string, shardIndex: number) {
    return readFile(this.objectShardDataPath(bucketName, objectId, shardIndex));
  }

  async readObjectShardByPath(bucketName: string, storagePath: string) {
    return readFile(this.objectShardPath(bucketName, storagePath));
  }

  async deleteObjectShardByPath(bucketName: string, storagePath: string) {
    await rm(this.objectShardPath(bucketName, storagePath), { force: true });
  }

  async deleteObjectShards(bucketName: string, objectId: string) {
    await rm(this.objectShardDirectoryPath(bucketName, objectId), {
      recursive: true,
      force: true
    });
  }

  async deleteObjectMetadata(bucketName: string, objectId: string) {
    await rm(this.objectMetadataPath(bucketName, objectId), { force: true });
  }
}
