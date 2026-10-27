import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { assessText } from "@/server/ocr/assess";
import { readPageRecord, writePageRecord, type PageRecord } from "@/server/ocr/pipeline";

export const IMPORTED_ENGINE = "imported_package" as const;
const PAGE_HEADER = /^={5,}\s*PDF PAGE\s+(\d+)\s*\/\s*(\d+)\s*={5,}\s*$/gm;

export type ParsedPackagePage = {
  pdfPage: number;
  originalText: string;
  usableCharacters: number;
  empty: boolean;
};

export type ParsedOcrPackage = {
  declaredPages: number;
  header: string;
  pages: ParsedPackagePage[];
  missingPageNumbers: number[];
  sourceSha256: string;
};

export type ImportCoverage = {
  packageFound: boolean;
  packageDir: string;
  files: { name: string; present: boolean; bytes: number | null }[];
  totalPdfPages: number;
  pagesWithExtractedText: number;
  pagesEmptyOrFailed: number;
  existingPilotPages: number;
  newlyImportedPages: number;
  duplicatePagesSkipped: number;
  missingFromPackage: number[];
  candidateChunksAfterIndex: number | null;
  approvedChunks: number;
  verifiedChunks: number;
  searchable: boolean;
  calibrationHumanReferences: number;
  accuracyMeasured: boolean;
  notes: string[];
};

function importedConfigHash(textSha256: string): string {
  return createHash("sha256").update(`imported_package:${textSha256}`).digest("hex").slice(0, 12);
}

function compactCharacters(text: string): number {
  return Array.from(text.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "").replace(/\s+/g, "")).length;
}

export function parseOcrTextPackage(text: string, textSha256?: string): ParsedOcrPackage {
  const sourceSha256 = textSha256 ?? createHash("sha256").update(text).digest("hex");
  const matches = Array.from(text.matchAll(PAGE_HEADER));
  if (matches.length === 0) {
    return { declaredPages: 0, header: text.slice(0, 400), pages: [], missingPageNumbers: [], sourceSha256 };
  }
  const declaredPages = Number(matches[0]?.[2] ?? 0);
  const header = text.slice(0, matches[0]?.index ?? 0).trim();
  const pages: ParsedPackagePage[] = [];
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index];
    if (!match || match.index === undefined) continue;
    const pdfPage = Number(match[1]);
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    const originalText = text.slice(start, end).replace(/^\s+/, "").replace(/\s+$/, "");
    const usableCharacters = compactCharacters(originalText);
    pages.push({ pdfPage, originalText, usableCharacters, empty: usableCharacters < 40 });
  }
  const present = new Set(pages.map((page) => page.pdfPage));
  const missingPageNumbers = Array.from({ length: declaredPages }, (_, index) => index + 1).filter((page) => !present.has(page));
  return { declaredPages, header, pages, missingPageNumbers, sourceSha256 };
}

export function importedPageRecord(input: {
  page: ParsedPackagePage;
  sourceSha256: string;
  configHash: string;
  packageTextSha256?: string;
  now?: Date;
}): PageRecord {
  const assessment = assessText(input.page.originalText, "arabic");
  const screenPassed = assessment.verdict === "usable";
  const packageNote = input.packageTextSha256 ? ` (text sha256 ${input.packageTextSha256.slice(0, 12)})` : "";
  return {
    schemaVersion: 1,
    pdfPage: input.page.pdfPage,
    stage: "ocr_completed",
    method: "ocr",
    text: input.page.originalText,
    embedded: { verdict: "absent", reason: "Imported package text; not an embedded PDF text layer from this pipeline.", characters: 0, scriptRatio: 0, stopwordRate: null, replacementRatio: 0, symbolRatio: 0 },
    ocr: {
      engine: IMPORTED_ENGINE,
      engineVersion: "al-qaduri-ocr-text.txt",
      languages: "ara",
      traineddata: {},
      dpi: 0,
      renderScale: 0,
      widthPx: 0,
      heightPx: 0,
      psm: 0,
      meanConfidence: null,
      wordCount: input.page.originalText.split(/\s+/).filter(Boolean).length,
      rotationDegrees: 0,
      rotationNote: `Imported from the full-book extracted-text package${packageNote}. Not this machine's Tesseract run. Accuracy unmeasured. Printed pages not assigned.`,
      elapsedMs: 0,
      screen: { passed: screenPassed, reasons: screenPassed ? [] : [assessment.reason] },
    },
    error: input.page.empty ? { code: "IMPORTED_PAGE_EMPTY", message: "The package page has fewer than 40 non-space characters after bidi marks are ignored.", hint: null } : null,
    sourceSha256: input.sourceSha256,
    configHash: input.configHash,
    processedAt: (input.now ?? new Date()).toISOString(),
  };
}

export async function importPackagePages(input: {
  outputDir: string;
  bookSourceSha256: string;
  parsed: ParsedOcrPackage;
  recordConfigHash?: string;
  dryRun?: boolean;
}): Promise<{
  configHash: string;
  packageFingerprint: string;
  existingPilotPages: number[];
  newlyImportedPages: number[];
  duplicatePagesSkipped: number[];
  emptyPages: number[];
}> {
  const packageFingerprint = importedConfigHash(input.parsed.sourceSha256);
  const configHash = input.recordConfigHash ?? packageFingerprint;
  const existingPilotPages: number[] = [];
  const newlyImportedPages: number[] = [];
  const duplicatePagesSkipped: number[] = [];
  const emptyPages: number[] = [];
  for (const page of input.parsed.pages) {
    if (page.empty) emptyPages.push(page.pdfPage);
    const existing = await readPageRecord(input.outputDir, page.pdfPage);
    if (existing) {
      if (existing.ocr?.engine === "tesseract") existingPilotPages.push(page.pdfPage);
      duplicatePagesSkipped.push(page.pdfPage);
      continue;
    }
    newlyImportedPages.push(page.pdfPage);
    if (input.dryRun) continue;
    await writePageRecord(input.outputDir, importedPageRecord({
      page,
      sourceSha256: input.bookSourceSha256,
      configHash,
      packageTextSha256: input.parsed.sourceSha256,
    }));
  }
  return { configHash, packageFingerprint, existingPilotPages, newlyImportedPages, duplicatePagesSkipped, emptyPages };
}

export async function writeCoverageReport(outputDir: string, coverage: ImportCoverage): Promise<string> {
  const dir = path.join(outputDir, "reports");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "imported-package-coverage.json");
  await writeFile(file, `${JSON.stringify(coverage, null, 2)}\n`, "utf8");
  const md = path.join(dir, "imported-package-coverage.md");
  await writeFile(md, [
    "# Al-Quduri imported OCR coverage",
    "",
    `- Package found: ${coverage.packageFound ? "yes" : "no"}`,
    `- Package dir: ${coverage.packageDir}`,
    `- Total PDF pages: ${coverage.totalPdfPages}`,
    `- Pages with extracted text: ${coverage.pagesWithExtractedText}`,
    `- Pages empty or failed: ${coverage.pagesEmptyOrFailed}`,
    `- Existing pilot pages reused: ${coverage.existingPilotPages}`,
    `- Newly imported candidate pages: ${coverage.newlyImportedPages}`,
    `- Duplicate pages skipped: ${coverage.duplicatePagesSkipped}`,
    `- Candidate chunks after index: ${coverage.candidateChunksAfterIndex ?? "not indexed in this run"}`,
    `- Approved / verified / searchable chunks: ${coverage.approvedChunks} / ${coverage.verifiedChunks} / ${coverage.searchable ? "yes" : "no"}`,
    `- Human calibration references: ${coverage.calibrationHumanReferences}`,
    `- Accuracy measured: ${coverage.accuracyMeasured ? "yes" : "no"}`,
    "",
    ...coverage.notes.map((note) => `- ${note}`),
    "",
  ].join("\n"), "utf8");
  return file;
}

export async function readOptionalFile(file: string): Promise<{ present: true; bytes: number } | { present: false; bytes: null }> {
  try {
    const buf = await readFile(file);
    return { present: true, bytes: buf.byteLength };
  } catch {
    return { present: false, bytes: null };
  }
}
