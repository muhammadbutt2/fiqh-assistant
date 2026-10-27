import { randomBytes } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { unavailableChat, unavailableTranslator, openAiCompatibleChat, openAiCompatibleTranslator } from "@/server/ai";
import { defaultRateLimit, type AppDeps } from "@/server/handlers";
import { createMemoryStore } from "@/server/store";
import { createPrismaStore } from "@/server/prisma-store";

const globalStore = globalThis as { fiqhDeps?: AppDeps };

export function resolveAuthSecret(envValue: string | undefined, filePath: string): string {
  const configured = envValue?.trim();
  if (configured) return configured;
  if (existsSync(filePath)) {
    const existing = readFileSync(filePath, "utf8").trim();
    if (existing.length >= 16) return existing;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  const created = randomBytes(32).toString("hex");
  writeFileSync(filePath, `${created}\n`, { encoding: "utf8" });
  return created;
}

export function getDeps(): AppDeps {
  if (globalStore.fiqhDeps) return globalStore.fiqhDeps;
  const apiKey = process.env.AI_API_KEY ?? "";
  const model = process.env.AI_CHAT_MODEL ?? "";
  const baseUrl = process.env.AI_BASE_URL || "https://api.openai.com/v1";
  const translationModel = process.env.AI_TRANSLATION_MODEL || model;
  const chat = apiKey && model ? openAiCompatibleChat({ apiKey, baseUrl, model }) : unavailableChat();
  const translator = apiKey && translationModel
    ? openAiCompatibleTranslator({ apiKey: process.env.TRANSLATION_API_KEY || apiKey, baseUrl: process.env.TRANSLATION_BASE_URL || baseUrl, model: translationModel })
    : unavailableTranslator();
  const store = process.env.DATABASE_URL
    ? createPrismaStore()
    : createMemoryStore(path.resolve(process.env.STORE_PATH || ".data/store.json"));
  globalStore.fiqhDeps = {
    store,
    chat,
    translator,
    authSecret: resolveAuthSecret(process.env.AUTH_SECRET, path.resolve(".data/auth-secret")),
    adminPassword: process.env.ADMIN_PASSWORD || null,
    storageDir: path.resolve(process.env.STORAGE_DIR || ".data/storage"),
    maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 83_886_080),
    rateLimit: defaultRateLimit(),
  };
  return globalStore.fiqhDeps;
}
