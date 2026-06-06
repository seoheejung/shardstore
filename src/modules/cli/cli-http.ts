import path from "node:path";

import { createCliError } from "./cli-output";

const defaultApiUrl = "http://localhost:8080";

export class CliHttpError extends Error {
  constructor(
    public readonly statusCode: number | null,
    public readonly payload: unknown
  ) {
    super("CLI HTTP request failed");
  }
}

export function getApiBaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const rawUrl = env.SHARDSTORE_API_URL?.trim() || defaultApiUrl;
  return rawUrl.replace(/\/+$/, "");
}

export function bucketUrl(baseUrl: string, bucketName: string) {
  return `${baseUrl}/buckets/${encodeURIComponent(bucketName)}`;
}

export function bucketsUrl(baseUrl: string) {
  return `${baseUrl}/buckets`;
}

export function objectUrl(baseUrl: string, bucketName: string, objectKey?: string) {
  const url = new URL(`${bucketUrl(baseUrl, bucketName)}/objects`);

  // Object keys may contain slashes, so they must stay in the query string.
  if (objectKey !== undefined) {
    url.searchParams.set("key", objectKey);
  }

  return url.toString();
}

export function objectMetadataUrl(
  baseUrl: string,
  bucketName: string,
  objectKey: string
) {
  const url = new URL(`${bucketUrl(baseUrl, bucketName)}/objects/metadata`);
  url.searchParams.set("key", objectKey);
  return url.toString();
}

export async function requestJson<T>(
  url: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await safeFetch(url, init);
  const payload = await readJsonPayload(response);

  if (!response.ok) {
    throw new CliHttpError(response.status, payload);
  }

  return payload as T;
}

export async function requestBinary(
  url: string,
  init: RequestInit = {}
): Promise<Buffer> {
  const response = await safeFetch(url, init);

  if (!response.ok) {
    throw new CliHttpError(response.status, await readJsonPayload(response));
  }

  return Buffer.from(await response.arrayBuffer());
}

export function createUploadForm(file: Buffer, filePath: string) {
  const form = new FormData();

  // The HTTP API contract requires this multipart field to be named "file".
  form.set("file", new Blob([new Uint8Array(file)]), path.basename(filePath));

  return form;
}

async function safeFetch(url: string, init: RequestInit) {
  try {
    return await fetch(url, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new CliHttpError(
      null,
      createCliError(
        "network_error",
        `Failed to connect to ShardStore API. Check that the server is running. ${message}`
      )
    );
  }
}

async function readJsonPayload(response: Response) {
  try {
    return await response.json();
  } catch {
    return createCliError(
      "invalid_response",
      `ShardStore API returned non-JSON response with status ${response.status}`
    );
  }
}
