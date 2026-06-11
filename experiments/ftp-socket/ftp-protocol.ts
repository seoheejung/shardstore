import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

export const DEFAULT_FTP_HOST = "127.0.0.1";
export const DEFAULT_FTP_PORT = 2121;

export type FtpRequest =
  | { command: "ls" }
  | { command: "put"; filename: string; size: number; checksum: string }
  | { command: "get"; filename: string }
  | { command: "quit" };

export type FtpJsonResponse =
  | { ready: true; message: string }
  | { files: string[] }
  | {
      uploaded: true;
      filename: string;
      size: number;
      checksum_matched: boolean;
    }
  | {
      download: true;
      filename: string;
      size: number;
      checksum: string;
    }
  | {
      downloaded: true;
      filename: string;
      output_path: string;
      checksum_matched: boolean;
    }
  | { closed: true }
  | { error: { code: string; message: string } };

export class SocketFrameReader {
  private buffer = Buffer.alloc(0);
  private readonly waiters: Array<() => void> = [];
  private ended = false;

  constructor(socket: net.Socket) {
    socket.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.notify();
    });
    socket.on("end", () => this.markEnded());
    socket.on("close", () => this.markEnded());
    socket.on("error", () => this.markEnded());
  }

  async readLine(): Promise<string | null> {
    while (true) {
      const lineEnd = this.buffer.indexOf(0x0a);
      if (lineEnd >= 0) {
        const line = this.buffer.subarray(0, lineEnd).toString("utf8");
        this.buffer = this.buffer.subarray(lineEnd + 1);
        return line.endsWith("\r") ? line.slice(0, -1) : line;
      }

      if (this.ended) {
        if (this.buffer.length === 0) {
          return null;
        }
        const line = this.buffer.toString("utf8");
        this.buffer = Buffer.alloc(0);
        return line;
      }

      await this.waitForData();
    }
  }

  async readBytes(size: number): Promise<Buffer | null> {
    while (true) {
      if (this.buffer.length >= size) {
        const bytes = this.buffer.subarray(0, size);
        this.buffer = this.buffer.subarray(size);
        return bytes;
      }

      if (this.ended) {
        return null;
      }

      await this.waitForData();
    }
  }

  private waitForData(): Promise<void> {
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  private markEnded(): void {
    this.ended = true;
    this.notify();
  }

  private notify(): void {
    while (this.waiters.length > 0) {
      this.waiters.shift()?.();
    }
  }
}

export function resolveFtpDataDir(projectRoot = process.cwd()): string {
  return path.resolve(projectRoot, "ftp-data");
}

export async function ensureFtpDataDir(projectRoot = process.cwd()): Promise<string> {
  const ftpDataDir = resolveFtpDataDir(projectRoot);
  await mkdir(ftpDataDir, { recursive: true });
  return ftpDataDir;
}

export function isSafeFilename(filename: string): boolean {
  return (
    filename.length > 0 &&
    filename === path.basename(filename) &&
    !filename.includes("/") &&
    !filename.includes("\\") &&
    filename !== "." &&
    filename !== ".."
  );
}

export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function writeJsonLine(socket: net.Socket, value: FtpJsonResponse | FtpRequest): Promise<void> {
  return writeAll(socket, Buffer.from(`${JSON.stringify(value)}\n`, "utf8"));
}

export function writeAll(socket: net.Socket, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.write(data, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export function errorResponse(code: string, message: string): FtpJsonResponse {
  // A stable JSON error shape keeps unsupported commands and path checks testable.
  return { error: { code, message } };
}
