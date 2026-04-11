import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry);
    const entryStat = await stat(fullPath);

    if (entryStat.isDirectory()) {
      files.push(...(await collectSourceFiles(fullPath)));
      continue;
    }

    if (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }

  return files;
}

describe("event write path guardrail", () => {
  it("only allows direct event.create usage inside events/service.ts", async () => {
    const srcRoot = path.resolve(process.cwd(), "src");
    const sourceFiles = await collectSourceFiles(srcRoot);

    const violations: string[] = [];

    for (const filePath of sourceFiles) {
      if (filePath.endsWith("src/server/events/service.ts")) {
        continue;
      }

      const contents = await readFile(filePath, "utf8");
      if (/\.\s*event\s*\.\s*create\s*\(/.test(contents)) {
        violations.push(path.relative(process.cwd(), filePath));
      }
    }

    expect(violations).toEqual([]);
  });
});
