/**
 * scripts/data/emit.ts
 *
 * Helpers for writing the generated TypeScript data modules under
 * `src/common/data/generated/`. Those files are excluded from Biome (see
 * `biome.json`) and formatted here instead, so numeric arrays stay compact.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Rounds to `digits` decimals, avoiding `-0` and exponent notation in the output. */
export function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return rounded === 0 ? 0 : rounded;
}

/** Formats a number array as a single compact literal, e.g. `[1, 2.5, -3]`. */
export function numberArray(values: readonly number[]): string {
  return `[${values.join(",")}]`;
}

/** Wraps `text` so generated lines stay under ~120 characters. */
export function wrap(text: string, indent = "  "): string {
  const lines: string[] = [];
  let line = "";
  for (const chunk of text.split(/(?<=,)/)) {
    if (line.length + chunk.length > 116 && line.length > 0) {
      lines.push(indent + line);
      line = "";
    }
    line += chunk;
  }
  if (line.length > 0) {
    lines.push(indent + line);
  }
  return lines.join("\n");
}

/**
 * Writes a generated module, prefixing the standard "do not edit" banner.
 *
 * @param relativePath - path relative to the repository root
 * @param description - one-paragraph description of the module's contents
 * @param body - the module source, without the banner
 */
export function writeGeneratedModule(relativePath: string, description: string, body: string): void {
  const path = resolve(process.cwd(), relativePath);
  const banner = `/**
 * ${relativePath.split("/").pop()}
 *
 * GENERATED FILE — DO NOT EDIT BY HAND.
 * Regenerate with \`npm run build-data\` (see scripts/build-data.ts).
 *
${description
  .trim()
  .split("\n")
  .map((line) => ` * ${line}`.trimEnd())
  .join("\n")}
 */
`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${banner}\n${body.trimEnd()}\n`, "utf8");
  console.log(`  wrote ${relativePath}`);
}
