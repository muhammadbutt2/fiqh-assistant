import { existsSync } from "fs";
import path from "path";
import type { EnvMap, OcrConfig } from "@/server/ocr/config";
import { OcrError } from "@/server/ocr/errors";
import type { PipelineDeps } from "@/server/ocr/pipeline";
import { openPdf } from "@/server/ocr/render";
import { createTesseractEngine, inspectEngine } from "@/server/ocr/tesseract";
import { createMemoryStore, type Store } from "@/server/store";

export function loadProjectEnv(cwd: string = process.cwd()): string[] {
  const loaded: string[] = [];
  for (const name of [".env.local", ".env"]) {
    const file = path.join(cwd, name);
    if (existsSync(file)) {
      process.loadEnvFile(file);
      loaded.push(name);
    }
  }
  return loaded;
}

export function booksDirectory(env: EnvMap = process.env): string {
  const value = env.BOOKS_DIR?.trim().replace(/^"(.*)"$/, "$1");
  if (!value) {
    throw new OcrError(
      "CONFIG_INVALID",
      "BOOKS_DIR is not set. It must point at the folder that holds your PDF books.",
      'Add a line such as BOOKS_DIR="D:\\path\\to\\books" to .env, or set $env:BOOKS_DIR in PowerShell.',
    );
  }
  if (!existsSync(value)) throw new OcrError("CONFIG_INVALID", `BOOKS_DIR points at a folder that does not exist: ${value}`);
  return value;
}

export async function openStore(env: EnvMap = process.env): Promise<Store> {
  if (env.DATABASE_URL) {
    const { createPrismaStore } = await import("@/server/prisma-store");
    return createPrismaStore();
  }
  return createMemoryStore(path.resolve(env.STORE_PATH || ".data/store.json"));
}

export function defaultDeps(config: OcrConfig): PipelineDeps {
  return {
    openPdf,
    engine: async () => {
      const inspection = await inspectEngine(config);
      if (!inspection.ok) throw inspection.error;
      return createTesseractEngine(inspection.info);
    },
  };
}
