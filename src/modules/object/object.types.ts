export interface UploadObjectResult {
  object_id: string;
  bucket: string;
  key: string;
  size: number;
  checksum: string;
}

export interface ObjectListItem {
  object_id: string;
  key: string;
  size: number;
  checksum: string;
  created_at: string;
}
