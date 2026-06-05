export interface BucketCreateResult {
  bucket: string;
  created: boolean;
}

export interface BucketExistsResult {
  bucket: string;
  exists: true;
}
