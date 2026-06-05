import { readFile, readdir, writeFile } from "fs/promises";
import path from "path";

import { LocalStorage } from "../storage/local-storage";
import { ObjectMetadata } from "./metadata.types";

export class MetadataRepository {
  constructor(private readonly storage: LocalStorage) {}

  async save(metadata: ObjectMetadata) {
    const filePath = this.storage.objectMetadataPath(
      metadata.bucket,
      metadata.object_id
    );
    await writeFile(filePath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  }

  async list(bucketName: string) {
    const metadataDir = path.join(
      this.storage.bucketPath(bucketName),
      "metadata",
      "objects"
    );

    let files: string[];
    try {
      files = await readdir(metadataDir);
    } catch (error) {
      if (isNotFound(error)) {
        return [];
      }
      throw error;
    }

    const metadata = await Promise.all(
      files
        .filter((fileName) => fileName.endsWith(".json"))
        .map((fileName) => this.readFile(path.join(metadataDir, fileName)))
    );

    return metadata.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async findByKey(bucketName: string, key: string) {
    const metadata = await this.list(bucketName);
    return metadata.find((item) => item.key === key) ?? null;
  }

  async readByObjectId(bucketName: string, objectId: string) {
    return this.readFile(this.storage.objectMetadataPath(bucketName, objectId));
  }

  private async readFile(filePath: string): Promise<ObjectMetadata> {
    return JSON.parse(await readFile(filePath, "utf8")) as ObjectMetadata;
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
