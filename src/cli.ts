import { readFile, stat, writeFile } from "node:fs/promises";

import {
  bucketUrl,
  bucketsUrl,
  CliHttpError,
  createUploadForm,
  getApiBaseUrl,
  objectMetadataUrl,
  objectUrl,
  requestBinary,
  requestJson
} from "./modules/cli/cli-http";
import { createCliError, printJson } from "./modules/cli/cli-output";

type CommandHandler = (args: string[]) => Promise<unknown>;

const baseUrl = getApiBaseUrl();

const commands: Record<string, CommandHandler> = {
  "bucket:create": async ([bucketName]) => {
    requireArgs("bucket:create", [bucketName], "<bucketName>");
    return requestJson(bucketUrl(baseUrl, bucketName), { method: "PUT" });
  },

  "bucket:get": async ([bucketName]) => {
    requireArgs("bucket:get", [bucketName], "<bucketName>");
    return requestJson(bucketUrl(baseUrl, bucketName));
  },

  "bucket:list": async () => requestJson(bucketsUrl(baseUrl)),

  "object:put": async ([bucketName, objectKey, filePath]) => {
    requireArgs("object:put", [bucketName, objectKey, filePath], "<bucketName> <objectKey> <filePath>");
    const file = await readExistingFile(filePath);
    const form = createUploadForm(file, filePath);

    return requestJson(objectUrl(baseUrl, bucketName, objectKey), {
      method: "PUT",
      body: form
    });
  },

  "object:meta": async ([bucketName, objectKey]) => {
    requireArgs("object:meta", [bucketName, objectKey], "<bucketName> <objectKey>");
    return requestJson(objectMetadataUrl(baseUrl, bucketName, objectKey));
  },

  "object:get": async ([bucketName, objectKey, outputPath]) => {
    requireArgs(
      "object:get",
      [bucketName, objectKey, outputPath],
      "<bucketName> <objectKey> <outputPath>"
    );
    const data = await requestBinary(objectUrl(baseUrl, bucketName, objectKey));

    // Write only after a successful HTTP response so error bodies never become files.
    await writeFile(outputPath, data);

    return {
      bucket: bucketName,
      key: objectKey,
      output_path: outputPath,
      downloaded: true
    };
  },

  "object:list": async ([bucketName]) => {
    requireArgs("object:list", [bucketName], "<bucketName>");
    return requestJson(objectUrl(baseUrl, bucketName));
  },

  "object:delete": async ([bucketName, objectKey]) => {
    requireArgs("object:delete", [bucketName, objectKey], "<bucketName> <objectKey>");
    return requestJson(objectUrl(baseUrl, bucketName, objectKey), {
      method: "DELETE"
    });
  }
};

async function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  const handler = command ? commands[command] : undefined;

  if (!handler) {
    printJson(
      createCliError(
        "unknown_command",
        `Usage: pnpm cli <command> [...args]. Supported commands: ${Object.keys(
          commands
        ).join(", ")}`
      )
    );
    process.exitCode = 1;
    return;
  }

  try {
    printJson(await handler(args));
  } catch (error) {
    process.exitCode = 1;

    if (error instanceof CliHttpError) {
      printJson(error.payload);
      return;
    }

    if (error instanceof CliUsageError) {
      printJson(createCliError(error.code, error.message));
      return;
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    printJson(createCliError("cli_error", message));
  }
}

function requireArgs(command: string, args: Array<string | undefined>, usage: string) {
  if (args.some((arg) => arg === undefined || arg.length === 0)) {
    throw new CliUsageError(
      "invalid_arguments",
      `Usage: pnpm cli ${command} ${usage}`
    );
  }
}

async function readExistingFile(filePath: string) {
  try {
    const fileStat = await stat(filePath);

    if (!fileStat.isFile()) {
      throw new CliUsageError("file_not_found", `File not found: ${filePath}`);
    }

    return await readFile(filePath);
  } catch (error) {
    if (error instanceof CliUsageError) {
      throw error;
    }

    throw new CliUsageError("file_not_found", `File not found: ${filePath}`);
  }
}

class CliUsageError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

void main();
