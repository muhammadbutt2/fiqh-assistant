import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import path from "path";

export function safeBasename(filename: string): string {
  if (!filename || filename.length > 180 || filename.includes("\0")) throw new Error("INVALID_NAME");
  if (/[/\\]/.test(filename) || filename.includes("..") || path.isAbsolute(filename)) throw new Error("PATH_TRAVERSAL");
  const base = path.basename(filename);
  if (base !== filename) throw new Error("PATH_TRAVERSAL");
  return base;
}

export function safeStoragePath(root: string, storedName: string): string {
  const base = safeBasename(storedName);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, base);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("PATH_TRAVERSAL");
  return resolved;
}

export type UploadFormat = "pdf" | "epub" | "txt" | "html";

export function detectUpload(filename: string, bytes: Uint8Array, maxBytes: number): UploadFormat {
  safeBasename(filename);
  if (bytes.byteLength === 0) throw new Error("EMPTY_FILE");
  if (bytes.byteLength > maxBytes) throw new Error("FILE_TOO_LARGE");
  if (bytes[0] === 0x4d && bytes[1] === 0x5a) throw new Error("INVALID_TYPE");
  const lower = filename.toLowerCase();
  const header = Buffer.from(bytes.subarray(0, 5)).toString("utf8");
  if (lower.endsWith(".pdf")) {
    if (!header.startsWith("%PDF")) throw new Error("INVALID_TYPE");
    return "pdf";
  }
  if (lower.endsWith(".epub")) {
    if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) throw new Error("INVALID_TYPE");
    return "epub";
  }
  if (lower.endsWith(".html") || lower.endsWith(".htm")) {
    if (bytes.includes(0)) throw new Error("INVALID_TYPE");
    return "html";
  }
  if (lower.endsWith(".txt")) {
    if (bytes.includes(0)) throw new Error("INVALID_TYPE");
    return "txt";
  }
  throw new Error("INVALID_TYPE");
}

export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string, now = Date.now()) => {
    const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 32);
  const previous = Buffer.from(hash, "hex");
  if (next.length !== previous.length) return false;
  return timingSafeEqual(next, previous);
}

export function passwordsEqual(provided: string, expected: string): boolean {
  const left = scryptSync(provided, "fiqh-compare", 32);
  const right = scryptSync(expected, "fiqh-compare", 32);
  return timingSafeEqual(left, right);
}

type SessionPayload = { sub: string; role: "admin" | "user"; exp: number };

export function signSession(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function readSession(token: string | undefined, secret: string | null): SessionPayload | null {
  if (!token || !secret) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (payload.exp < Date.now()) return null;
    if (payload.role !== "admin" && payload.role !== "user") return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionFromRequest(request: Request, secret: string | null): SessionPayload | null {
  const header = request.headers.get("cookie") ?? "";
  const match = header.match(/(?:^|;\s*)fiqh_session=([^;]+)/);
  return readSession(match?.[1] ? decodeURIComponent(match[1]) : undefined, secret);
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "local";
}
