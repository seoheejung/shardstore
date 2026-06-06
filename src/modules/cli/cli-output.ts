export interface JsonPrinter {
  (value: string): void;
}

export function printJson(value: unknown, write: JsonPrinter = console.log) {
  write(JSON.stringify(value, null, 2));
}

export function createCliError(code: string, message: string) {
  return {
    error: {
      code,
      message
    }
  };
}
