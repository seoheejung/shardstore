import { readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import {
  DEFAULT_FTP_HOST,
  DEFAULT_FTP_PORT,
  FtpJsonResponse,
  FtpRequest,
  SocketFrameReader,
  sha256,
  writeAll,
  writeJsonLine
} from "./ftp-protocol";

export interface FtpClientOptions {
  host?: string;
  port?: number;
  downloadDir?: string;
}

export class FtpSocketClient {
  private readonly reader: SocketFrameReader;

  constructor(
    private readonly socket: net.Socket,
    private readonly downloadDir = process.cwd()
  ) {
    this.reader = new SocketFrameReader(socket);
  }

  async readGreeting(): Promise<FtpJsonResponse> {
    return this.readJsonResponse();
  }

  async list(): Promise<FtpJsonResponse> {
    await this.sendRequest({ command: "ls" });
    return this.readJsonResponse();
  }

  async put(filePath: string): Promise<FtpJsonResponse> {
    let payload: Buffer;
    try {
      payload = await readFile(filePath);
    } catch {
      return {
        error: {
          code: "local_file_not_found",
          message: "local file not found"
        }
      };
    }

    const filename = path.basename(filePath);

    await this.sendRequest({
      command: "put",
      filename,
      size: payload.length,
      checksum: sha256(payload)
    });
    await writeAll(this.socket, payload);

    return this.readJsonResponse();
  }

  async get(filename: string): Promise<FtpJsonResponse> {
    await this.sendRequest({ command: "get", filename });

    const header = await this.readJsonResponse();
    if (!("download" in header)) {
      return header;
    }

    const payload = await this.reader.readBytes(header.size);
    if (payload === null) {
      return {
        error: {
          code: "incomplete_payload",
          message: "file payload ended early"
        }
      };
    }

    const outputPath = path.join(this.downloadDir, header.filename);
    await writeFile(outputPath, payload);

    return {
      downloaded: true,
      filename: header.filename,
      output_path: header.filename,
      checksum_matched: sha256(payload) === header.checksum
    };
  }

  async quit(): Promise<FtpJsonResponse> {
    await this.sendRequest({ command: "quit" });
    const response = await this.readJsonResponse();
    this.socket.end();
    return response;
  }

  async executeCommand(line: string): Promise<FtpJsonResponse> {
    const parts = line.trim().split(/\s+/).filter(Boolean);
    const command = parts[0];

    if (command === "ls" && parts.length === 1) {
      return this.list();
    }

    if (command === "put" && parts.length === 2) {
      return this.put(parts[1]);
    }

    if (command === "get" && parts.length === 2) {
      return this.get(parts[1]);
    }

    if (command === "quit" && parts.length === 1) {
      return this.quit();
    }

    // Unsupported input remains a client-side JSON error instead of extending Phase 2 CLI.
    return {
      error: {
        code: "unsupported_command",
        message: "supported commands: ls, put <filepath>, get <filename>, quit"
      }
    };
  }

  private async sendRequest(request: FtpRequest): Promise<void> {
    await writeJsonLine(this.socket, request);
  }

  private async readJsonResponse(): Promise<FtpJsonResponse> {
    const line = await this.reader.readLine();
    if (line === null) {
      return {
        error: {
          code: "connection_closed",
          message: "server closed the connection"
        }
      };
    }

    try {
      return JSON.parse(line) as FtpJsonResponse;
    } catch {
      return {
        error: {
          code: "invalid_response",
          message: "server returned invalid JSON"
        }
      };
    }
  }
}

export async function connectFtpClient(options: FtpClientOptions = {}): Promise<FtpSocketClient> {
  const host = options.host ?? DEFAULT_FTP_HOST;
  const port = options.port ?? DEFAULT_FTP_PORT;
  const socket = net.createConnection({ host, port });

  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });

  const client = new FtpSocketClient(socket, options.downloadDir);
  await client.readGreeting();
  return client;
}

async function runCli(): Promise<void> {
  const host = process.argv[2] ?? DEFAULT_FTP_HOST;
  const port = Number(process.argv[3] ?? DEFAULT_FTP_PORT);
  const client = await connectFtpClient({ host, port });
  const readline = createInterface({ input, output });

  console.log("connected to FTP-style TCP server");

  try {
    while (true) {
      const line = await readline.question("ftp> ");
      const response = await client.executeCommand(line);
      console.log(JSON.stringify(response, null, 2));

      if ("closed" in response) {
        break;
      }
    }
  } finally {
    readline.close();
  }
}

if (require.main === module) {
  runCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(
      JSON.stringify(
        {
          error: {
            code: "client_error",
            message
          }
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  });
}
