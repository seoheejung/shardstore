import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

import {
  DEFAULT_FTP_HOST,
  DEFAULT_FTP_PORT,
  FtpRequest,
  SocketFrameReader,
  ensureFtpDataDir,
  errorResponse,
  isSafeFilename,
  sha256,
  writeAll,
  writeJsonLine
} from "./ftp-protocol";

export interface FtpServerOptions {
  host?: string;
  port?: number;
  projectRoot?: string;
}

export function createFtpServer(options: FtpServerOptions = {}): net.Server {
  return net.createServer((socket) => {
    void handleClient(socket, options.projectRoot ?? process.cwd());
  });
}

export async function listenFtpServer(options: FtpServerOptions = {}): Promise<net.Server> {
  const host = options.host ?? DEFAULT_FTP_HOST;
  const port = options.port ?? DEFAULT_FTP_PORT;
  const server = createFtpServer(options);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  return server;
}

async function handleClient(socket: net.Socket, projectRoot: string): Promise<void> {
  const reader = new SocketFrameReader(socket);
  const ftpDataDir = await ensureFtpDataDir(projectRoot);

  await writeJsonLine(socket, {
    ready: true,
    message: "connected to FTP-style TCP server"
  });

  while (!socket.destroyed) {
    const line = await reader.readLine();
    if (line === null) {
      break;
    }

    const request = parseRequest(line);
    if (!request) {
      await writeJsonLine(socket, errorResponse("invalid_request", "invalid JSON request"));
      continue;
    }

    if (request.command === "ls") {
      await handleLs(socket, ftpDataDir);
      continue;
    }

    if (request.command === "put") {
      await handlePut(socket, reader, ftpDataDir, request);
      continue;
    }

    if (request.command === "get") {
      await handleGet(socket, ftpDataDir, request);
      continue;
    }

    if (request.command === "quit") {
      await writeJsonLine(socket, { closed: true });
      socket.end();
      break;
    }

    await writeJsonLine(socket, errorResponse("unsupported_command", "unsupported command"));
  }
}

function parseRequest(line: string): FtpRequest | null {
  try {
    const value = JSON.parse(line) as Partial<FtpRequest>;
    if (value.command === "ls" || value.command === "quit") {
      return { command: value.command };
    }
    if (
      value.command === "put" &&
      typeof value.filename === "string" &&
      typeof value.size === "number" &&
      Number.isSafeInteger(value.size) &&
      value.size >= 0 &&
      typeof value.checksum === "string"
    ) {
      return value as FtpRequest;
    }
    if (value.command === "get" && typeof value.filename === "string") {
      return value as FtpRequest;
    }
  } catch {
    return null;
  }

  return null;
}

async function handleLs(socket: net.Socket, ftpDataDir: string): Promise<void> {
  const entries = await readdir(ftpDataDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name !== ".gitkeep")
    .map((entry) => entry.name)
    .sort();

  await writeJsonLine(socket, { files });
}

async function handlePut(
  socket: net.Socket,
  reader: SocketFrameReader,
  ftpDataDir: string,
  request: Extract<FtpRequest, { command: "put" }>
): Promise<void> {
  const payload = await reader.readBytes(request.size);
  if (payload === null) {
    await writeJsonLine(socket, errorResponse("incomplete_payload", "file payload ended early"));
    return;
  }

  if (!isSafeFilename(request.filename)) {
    await writeJsonLine(socket, errorResponse("invalid_filename", "invalid filename"));
    return;
  }

  const outputPath = path.join(ftpDataDir, request.filename);
  await writeFile(outputPath, payload);

  const serverChecksum = sha256(payload);
  await writeJsonLine(socket, {
    uploaded: true,
    filename: request.filename,
    size: payload.length,
    checksum_matched: serverChecksum === request.checksum
  });
}

async function handleGet(
  socket: net.Socket,
  ftpDataDir: string,
  request: Extract<FtpRequest, { command: "get" }>
): Promise<void> {
  if (!isSafeFilename(request.filename)) {
    await writeJsonLine(socket, errorResponse("invalid_filename", "invalid filename"));
    return;
  }

  const sourcePath = path.join(ftpDataDir, request.filename);

  try {
    const sourceStat = await stat(sourcePath);
    if (!sourceStat.isFile()) {
      await writeJsonLine(socket, errorResponse("not_found", "file not found"));
      return;
    }
  } catch {
    await writeJsonLine(socket, errorResponse("not_found", "file not found"));
    return;
  }

  const payload = await readFile(sourcePath);
  await writeJsonLine(socket, {
    download: true,
    filename: request.filename,
    size: payload.length,
    checksum: sha256(payload)
  });
  await writeAll(socket, payload);
}

if (require.main === module) {
  listenFtpServer().then((server) => {
    const address = server.address();
    if (address && typeof address !== "string") {
      console.log(`FTP-style TCP server listening on ${address.address}:${address.port}`);
    }
  });
}
