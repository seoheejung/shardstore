import { ObjectMetadata } from "../metadata/metadata.types";

export interface StoredObject {
  metadata: ObjectMetadata;
  data: Buffer;
}
