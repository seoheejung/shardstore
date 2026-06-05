export interface ObjectMetadata {
  schema_version: 1;
  object_id: string;
  bucket: string;
  key: string;
  original_file_name: string;
  content_type: string;
  size: number;
  checksum: string;
  storage_path: string;
  created_at: string;
}
