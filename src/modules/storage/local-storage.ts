import { mkdir, readFile, readdir, rm, writeFile } from "fs/promises";
import path from "path";

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

  objectShardStoragePath(objectId: string, shardIndex: number) {
    return path.posix.join("shards", objectId, `shard_${shardIndex}.data`);
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

  async readObjectShard(bucketName: string, objectId: string, shardIndex: number) {
    return readFile(this.objectShardDataPath(bucketName, objectId, shardIndex));
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
