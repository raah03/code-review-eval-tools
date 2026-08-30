import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { z } from "zod";

/** unvalidated, for files that stay schema-invalid until a later pipeline stage */
export function readJsonRaw(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function readJson<T>(schema: z.ZodType<T>, path: string): T {
  return schema.parse(readJsonRaw(path));
}

/** two-space indent plus trailing newline, the convention for every dataset artifact */
export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** validates first, writes exactly what validation returned */
export function writeJsonValidated<T>(path: string, schema: z.ZodType<T>, value: T): void {
  writeJson(path, schema.parse(value));
}
