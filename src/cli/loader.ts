import { readFileSync } from "node:fs";
import { ScenarioFileSchema } from "../types.js";
import type { z } from "zod";

export type ScenarioFile = z.infer<typeof ScenarioFileSchema>;

export function loadScenarioFile(filePath: string): ScenarioFile {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (err) {
    throw new Error(`Failed to read scenario file: ${filePath} — ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse JSON in ${filePath}: ${(err as Error).message}`);
  }

  const result = ScenarioFileSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid scenario file ${filePath}:\n${issues}`);
  }

  return result.data;
}
