import { readdir } from "fs/promises";
import path from "path";
import { EXPECTED_WORKS, LOCAL_BOOK_FILES } from "@/data/sources";
import { validateLanguages } from "@/server/ocr/config";
import { OcrError } from "@/server/ocr/errors";
import type { Madhhab } from "@/server/madhhab";

export type BookMeta = {
  bookId: string;
  fileName: string;
  filePath: string;
  workId: string | null;
  madhhab: Madhhab;
  sourceClass: "primary" | "secondary";
  language: "ar" | "ur" | "en";
  ocrLanguages: string;
  ocrLanguageReason: string;
};

export function bookIdFromFile(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").toLowerCase();
  if (base.startsWith("bahishtizewar")) return "bahishti-zewar";
  return base.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

type Rule = { test: (name: string) => boolean; workId: string; sourceClass: BookMeta["sourceClass"]; language: BookMeta["language"]; ocrLanguages: string; reason: string };

// Language choice per work. Hidayah, Quduri and Hindiyyah are Arabic-only texts. Bahishti Zewar is Urdu prose
// that quotes Arabic, so it gets urd+ara until a pilot shows that urd alone reads the quotations acceptably.
const RULES: Rule[] = [
  { test: (n) => n.startsWith("al-qaduri"), workId: "quduri", sourceClass: "primary", language: "ar", ocrLanguages: "ara", reason: "Arabic-only matn." },
  { test: (n) => n.startsWith("al-hadaya") || n.startsWith("alhadayah"), workId: "hidayah", sourceClass: "primary", language: "ar", ocrLanguages: "ara", reason: "Arabic-only text." },
  { test: (n) => n.startsWith("fhindia"), workId: "hindiyyah", sourceClass: "primary", language: "ar", ocrLanguages: "ara", reason: "Arabic-only text." },
  { test: (n) => n.startsWith("bahishtizewar"), workId: "bahishti", sourceClass: "secondary", language: "ur", ocrLanguages: "urd+ara", reason: "Urdu prose with Arabic quotations. Override with --ocr-lang urd or ara if a pilot shows one language is enough." },
];

export function describeBook(fileName: string, directory: string, override?: { ocrLanguages?: string }): BookMeta {
  const rule = RULES.find((item) => item.test(fileName.toLowerCase()));
  const base: BookMeta = {
    bookId: bookIdFromFile(fileName),
    fileName,
    filePath: path.join(directory, fileName),
    workId: rule?.workId ?? null,
    madhhab: "hanafi",
    sourceClass: rule?.sourceClass ?? "secondary",
    language: rule?.language ?? "ar",
    ocrLanguages: rule?.ocrLanguages ?? "ara",
    ocrLanguageReason: rule?.reason ?? "No rule for this file name. Default is Arabic. Pass --ocr-lang to change it.",
  };
  if (override?.ocrLanguages) {
    base.ocrLanguages = validateLanguages(override.ocrLanguages);
    base.ocrLanguageReason = "Set explicitly with --ocr-lang.";
  }
  return base;
}

export async function listBooks(directory: string): Promise<BookMeta[]> {
  const names = (await readdir(directory)).filter((name) => name.toLowerCase().endsWith(".pdf")).sort();
  return names.map((name) => describeBook(name, directory));
}

export function resolveBook(books: BookMeta[], query: string): BookMeta {
  const needle = query.trim().toLowerCase();
  const exact = books.filter((book) => book.bookId === needle || book.fileName.toLowerCase() === needle || book.fileName.toLowerCase() === `${needle}.pdf`);
  if (exact.length === 1) return exact[0] as BookMeta;
  const prefix = books.filter((book) => book.bookId.startsWith(needle) || book.fileName.toLowerCase().startsWith(needle));
  if (prefix.length === 1) return prefix[0] as BookMeta;
  const known = books.map((book) => book.bookId).join(", ");
  if (prefix.length > 1) throw new OcrError("CONFIG_INVALID", `--book ${JSON.stringify(query)} matches more than one file: ${prefix.map((book) => book.bookId).join(", ")}.`);
  throw new OcrError("CONFIG_INVALID", `--book ${JSON.stringify(query)} matches no PDF in the books folder. Known ids: ${known || "none"}.`);
}

export function registryWork(workId: string | null): { title: string; author: string } | null {
  if (!workId) return null;
  const work = EXPECTED_WORKS.find((item) => item.id === workId);
  return work ? { title: work.canonicalTitle, author: work.author } : null;
}

export function registryHashNote(sha256: string): string | null {
  return LOCAL_BOOK_FILES.find((file) => file.sha256 === sha256)?.notes ?? null;
}

export function volumeFromTitle(title: string | null): number | null {
  const match = title?.match(/ج\s*(\d+)/);
  return match ? Number(match[1]) : null;
}
