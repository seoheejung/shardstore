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

  objectDataPath(bucketName: string, objectId: string) {
    return path.join(this.bucketPath(bucketName), "objects", `${objectId}.data`);
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
    await mkdir(path.join(this.bucketPath(bucketName), "objects"), {
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

  async writeObjectData(bucketName: string, objectId: string, data: Buffer) {
    await writeFile(this.objectDataPath(bucketName, objectId), data);
  }

  async readObjectData(bucketName: string, objectId: string) {
    return readFile(this.objectDataPath(bucketName, objectId));
  }

  async deleteObjectData(bucketName: string, objectId: string) {
    await rm(this.objectDataPath(bucketName, objectId), { force: true });
  }

  async deleteObjectMetadata(bucketName: string, objectId: string) {
    await rm(this.objectMetadataPath(bucketName, objectId), { force: true });
  }
}
