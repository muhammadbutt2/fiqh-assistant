import { createHash } from "crypto";
import { mkdir, readFile, readdir, writeFile } from "fs/promises";
import path from "path";
import type { Thresholds } from "@/server/ocr/config";
import { aggregateMetrics, evaluatePair, strictForm, type PairMetrics } from "@/server/ocr/metrics";
import { listPageRecords, type PageRecord } from "@/server/ocr/pipeline";

export type Stratum = "front" | "middle" | "back" | "clean" | "poor" | "rotated" | "layout_complex" | "spread" | "reviewer_added";

export type SampleEntry = { pdfPage: number; strata: Stratum[]; meanConfidence: number | null; rotationDegrees: number };

export type ReferenceMeta = {
  pdfPage: number;
  reviewer: string;
  reviewedOn: string;
  edition: string | null;
  notes: string;
  confirmedIdenticalToOcr: boolean;
  referenceSha256: string;
  ocrTextSha256: string;
};

export type SampleResult = {
  pdfPage: number;
  strata: Stratum[];
  status: "evaluated" | "missing_reference" | "excluded";
  exclusionReasons: string[];
  strict: PairMetrics | null;
  folded: PairMetrics | null;
  pagePassed: boolean | null;
  referenceChars: number | null;
};

export type CalibrationVerdict = {
  status: "unmeasured" | "insufficient_samples" | "insufficient_coverage" | "failed" | "passed";
  reasons: string[];
  gateMetric: Thresholds["gateMetric"];
  thresholds: Thresholds;
};

export type CalibrationReport = {
  schemaVersion: 1;
  bookId: string;
  sourceSha256: string;
  configHash: string;
  language: string;
  ocrLanguages: string;
  ocrEngine: string | null;
  ocrEngineVersion: string | null;
  traineddata: Record<string, string>;
  edition: string | null;
  evaluatedAt: string;
  samples: SampleResult[];
  aggregate: { strict: PairMetrics | null; folded: PairMetrics | null };
  reliableSampleCount: number;
  missingReferences: number[];
  excludedSamples: { pdfPage: number; reasons: string[] }[];
  coverage: { required: Stratum[]; covered: Stratum[]; missing: Stratum[]; notes: string[] };
  verdict: CalibrationVerdict;
  failedPages: number[];
  normalization: string;
};

export const NORMALIZATION_NOTE =
  "Strict metrics apply only Unicode NFC, removal of invisible bidi marks, and whitespace collapsing. Folded metrics additionally remove harakat and tatweel and unify alef, yeh, kaf, heh and digit forms. The gate uses the metric named in verdict.gateMetric. The reference and OCR files on disk are never modified.";

export function calibrationDir(outputDir: string): string {
  return path.join(outputDir, "calibration");
}

const pad = (pdfPage: number) => String(pdfPage).padStart(5, "0");

function digest(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function layoutScore(text: string): number {
  const lines = text.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const markers = (text.match(/[(\[]\s*[\d\u0660-\u0669]+\s*[)\]]/g) ?? []).length;
  const short = lines.filter((line) => line.length < 28).length;
  return markers * 3 + short;
}

export function selectSamples(records: PageRecord[], numPages: number, count: number, thresholds: Thresholds): SampleEntry[] {
  const ocr = records.filter((record) => record.stage === "ocr_completed" && record.text.trim().length > 0 && record.ocr?.engine !== "imported_package");
  const picked = new Map<number, Set<Stratum>>();
  const add = (record: PageRecord | undefined, stratum: Stratum) => {
    if (!record) return;
    if (!picked.has(record.pdfPage)) picked.set(record.pdfPage, new Set());
    picked.get(record.pdfPage)?.add(stratum);
  };
  const position = (record: PageRecord) => record.pdfPage / numPages;
  const thirds: [Stratum, (p: number) => boolean][] = [
    ["front", (p) => p <= 1 / 3],
    ["middle", (p) => p > 1 / 3 && p <= 2 / 3],
    ["back", (p) => p > 2 / 3],
  ];
  for (const [stratum, inside] of thirds) {
    const group = ocr.filter((record) => inside(position(record)));
    add(group[Math.floor(group.length / 2)], stratum);
  }
  const byConfidence = ocr.filter((record) => record.ocr?.meanConfidence != null).sort((a, b) => (a.ocr?.meanConfidence ?? 0) - (b.ocr?.meanConfidence ?? 0));
  byConfidence.filter((record) => (record.ocr?.meanConfidence ?? 100) < thresholds.poorConfidence || record.ocr?.screen.passed === false).slice(0, 2).forEach((record) => add(record, "poor"));
  add(byConfidence[byConfidence.length - 1], "clean");
  ocr.filter((record) => (record.ocr?.rotationDegrees ?? 0) !== 0).slice(0, 2).forEach((record) => add(record, "rotated"));
  [...ocr].sort((a, b) => layoutScore(b.text) - layoutScore(a.text)).slice(0, 2).filter((record) => layoutScore(record.text) > 0).forEach((record) => add(record, "layout_complex"));
  for (let index = 0; picked.size < Math.min(count, ocr.length) && index < ocr.length; index++) {
    const record = ocr[Math.floor(((index + 0.5) / Math.max(count, 1)) * ocr.length) % ocr.length];
    if (record && !picked.has(record.pdfPage)) add(record, "spread");
    if (index > count * 4) break;
  }
  const entries: SampleEntry[] = [];
  for (const [pdfPage, strata] of picked) {
    const record = ocr.find((item) => item.pdfPage === pdfPage);
    entries.push({ pdfPage, strata: Array.from(strata), meanConfidence: record?.ocr?.meanConfidence ?? null, rotationDegrees: record?.ocr?.rotationDegrees ?? 0 });
  }
  return entries.sort((a, b) => a.pdfPage - b.pdfPage).slice(0, Math.max(count, 3));
}

export async function writeSamples(outputDir: string, samples: SampleEntry[], records: PageRecord[], withDraft: boolean): Promise<string> {
  const dir = calibrationDir(outputDir);
  await mkdir(path.join(dir, "reference"), { recursive: true });
  const existing = await readSamples(outputDir);
  const merged = new Map<number, SampleEntry>(existing.map((entry) => [entry.pdfPage, entry]));
  for (const entry of samples) {
    const previous = merged.get(entry.pdfPage);
    merged.set(entry.pdfPage, previous ? { ...entry, strata: Array.from(new Set([...previous.strata, ...entry.strata])) } : entry);
  }
  const all = Array.from(merged.values()).sort((a, b) => a.pdfPage - b.pdfPage);
  await writeFile(path.join(dir, "samples.json"), JSON.stringify(all, null, 2), "utf8");
  if (withDraft) {
    await mkdir(path.join(dir, "draft"), { recursive: true });
    for (const entry of all) {
      const record = records.find((item) => item.pdfPage === entry.pdfPage);
      if (record) await writeFile(path.join(dir, "draft", `p${pad(entry.pdfPage)}.txt`), record.text, "utf8");
    }
  }
  return path.join(dir, "samples.json");
}

export async function readSamples(outputDir: string): Promise<SampleEntry[]> {
  try {
    return JSON.parse(await readFile(path.join(calibrationDir(outputDir), "samples.json"), "utf8")) as SampleEntry[];
  } catch {
    return [];
  }
}

export async function importReference(input: {
  outputDir: string;
  pdfPage: number;
  referenceText: string;
  reviewer: string;
  edition: string | null;
  notes: string;
  confirmIdentical: boolean;
  now?: Date;
}): Promise<{ meta: ReferenceMeta; warnings: string[] }> {
  const records = await listPageRecords(input.outputDir);
  const record = records.find((item) => item.pdfPage === input.pdfPage);
  if (!record || record.stage !== "ocr_completed") throw new Error(`Page ${input.pdfPage} has no completed OCR output in this configuration. Run the pilot for that page first.`);
  if (record.ocr?.engine === "imported_package") {
    throw new Error(`Page ${input.pdfPage} is imported-package OCR, not this configuration's Tesseract output. Transcribe the page image and import a reference only for a Tesseract page.`);
  }
  if (!input.reviewer.trim()) throw new Error("A reviewer name is required so the reference can be attributed.");
  const warnings: string[] = [];
  const identical = strictForm(input.referenceText) === strictForm(record.text);
  if (identical && !input.confirmIdentical) warnings.push("The reference is identical to the OCR output. It will be excluded from the verdict unless it was imported with --confirm-identical after a careful check against the page image.");
  const dir = path.join(calibrationDir(input.outputDir), "reference");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `p${pad(input.pdfPage)}.txt`), input.referenceText, "utf8");
  const meta: ReferenceMeta = {
    pdfPage: input.pdfPage,
    reviewer: input.reviewer.trim(),
    reviewedOn: (input.now ?? new Date()).toISOString().slice(0, 10),
    edition: input.edition,
    notes: input.notes,
    confirmedIdenticalToOcr: input.confirmIdentical,
    referenceSha256: digest(input.referenceText),
    ocrTextSha256: digest(record.text),
  };
  await writeFile(path.join(dir, `p${pad(input.pdfPage)}.meta.json`), JSON.stringify(meta, null, 2), "utf8");
  const samples = await readSamples(input.outputDir);
  if (!samples.some((entry) => entry.pdfPage === input.pdfPage)) {
    await writeSamples(input.outputDir, [{ pdfPage: input.pdfPage, strata: ["reviewer_added"], meanConfidence: record.ocr?.meanConfidence ?? null, rotationDegrees: record.ocr?.rotationDegrees ?? 0 }], records, false);
  }
  return { meta, warnings };
}

async function readReference(outputDir: string, pdfPage: number): Promise<{ text: string; meta: ReferenceMeta | null } | null> {
  const dir = path.join(calibrationDir(outputDir), "reference");
  let text: string;
  try {
    text = await readFile(path.join(dir, `p${pad(pdfPage)}.txt`), "utf8");
  } catch {
    return null;
  }
  let meta: ReferenceMeta | null = null;
  try {
    meta = JSON.parse(await readFile(path.join(dir, `p${pad(pdfPage)}.meta.json`), "utf8")) as ReferenceMeta;
  } catch {
    meta = null;
  }
  return { text, meta };
}

async function referencedPages(outputDir: string): Promise<number[]> {
  try {
    return (await readdir(path.join(calibrationDir(outputDir), "reference")))
      .map((name) => name.match(/^p(\d+)\.txt$/)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number);
  } catch {
    return [];
  }
}

export async function evaluateCalibration(input: {
  outputDir: string;
  bookId: string;
  numPages: number;
  sourceSha256: string;
  configHash: string;
  language: string;
  ocrLanguages: string;
  thresholds: Thresholds;
  now?: Date;
}): Promise<CalibrationReport> {
  const { thresholds } = input;
  const records = await listPageRecords(input.outputDir);
  const ocrRecords = records.filter((record) => record.stage === "ocr_completed" && record.ocr?.engine !== "imported_package");
  const samples = await readSamples(input.outputDir);
  const refPages = await referencedPages(input.outputDir);
  const allPages = Array.from(new Set([...samples.map((entry) => entry.pdfPage), ...refPages])).sort((a, b) => a - b);
  const results: SampleResult[] = [];
  const editions = new Set<string>();

  for (const pdfPage of allPages) {
    const sample = samples.find((entry) => entry.pdfPage === pdfPage);
    const strata = sample?.strata ?? ["reviewer_added" as Stratum];
    const record = ocrRecords.find((item) => item.pdfPage === pdfPage);
    const reference = await readReference(input.outputDir, pdfPage);
    if (!reference) {
      results.push({ pdfPage, strata, status: "missing_reference", exclusionReasons: [], strict: null, folded: null, pagePassed: null, referenceChars: null });
      continue;
    }
    const reasons: string[] = [];
    if (!record) reasons.push("no completed OCR output for this page in this configuration");
    if (!reference.meta) reasons.push("no reviewer metadata (import the reference with the calibrate import command)");
    else {
      if (!reference.meta.reviewer.trim()) reasons.push("reviewer name is empty");
      if (digest(reference.text) !== reference.meta.referenceSha256) reasons.push("reference file changed after it was imported");
      if (record && digest(record.text) !== reference.meta.ocrTextSha256) reasons.push("OCR text changed after the reference was imported");
      if (reference.meta.edition) editions.add(reference.meta.edition);
    }
    const referenceChars = Array.from(strictForm(reference.text)).length;
    if (referenceChars < thresholds.minReferenceChars) reasons.push(`reference has ${referenceChars} characters, fewer than the ${thresholds.minReferenceChars} required`);
    if (record && strictForm(record.text) === strictForm(reference.text) && !reference.meta?.confirmedIdenticalToOcr) {
      reasons.push("reference is identical to the OCR output and was not confirmed against the page image");
    }
    if (reasons.length > 0 || !record) {
      results.push({ pdfPage, strata, status: "excluded", exclusionReasons: reasons, strict: null, folded: null, pagePassed: null, referenceChars });
      continue;
    }
    const strict = evaluatePair(reference.text, record.text, "strict");
    const folded = evaluatePair(reference.text, record.text, "folded");
    const gate = thresholds.gateMetric === "folded" ? folded : strict;
    results.push({ pdfPage, strata, status: "evaluated", exclusionReasons: [], strict, folded, pagePassed: gate.cer <= thresholds.maxPageCer, referenceChars });
  }

  const evaluated = results.filter((item) => item.status === "evaluated");
  const strictAggregate = evaluated.length > 0 ? aggregateMetrics(evaluated.map((item) => item.strict as PairMetrics), "strict") : null;
  const foldedAggregate = evaluated.length > 0 ? aggregateMetrics(evaluated.map((item) => item.folded as PairMetrics), "folded") : null;
  const gateAggregate = thresholds.gateMetric === "folded" ? foldedAggregate : strictAggregate;

  const required: Stratum[] = ["front", "middle", "back"];
  const poorExists = ocrRecords.some((record) => (record.ocr?.meanConfidence ?? 100) < thresholds.poorConfidence || record.ocr?.screen.passed === false);
  if (poorExists) required.push("poor");
  const covered = Array.from(new Set(evaluated.flatMap((item) => item.strata)));
  const coveredPositions = new Set<Stratum>(covered);
  for (const item of evaluated) {
    const ratio = item.pdfPage / input.numPages;
    coveredPositions.add(ratio <= 1 / 3 ? "front" : ratio <= 2 / 3 ? "middle" : "back");
  }
  const missing = required.filter((stratum) => !coveredPositions.has(stratum));
  const coverageNotes: string[] = [];
  for (const optional of ["rotated", "layout_complex", "clean"] as Stratum[]) {
    if (!covered.includes(optional)) coverageNotes.push(`No evaluated sample covers the ${optional} stratum. It is reported as a gap and does not block the verdict.`);
  }
  if (!poorExists) coverageNotes.push("No OCR page in this configuration was flagged poor, so the poor stratum is not required. That says nothing about pages that were not OCR'd.");

  const reasons: string[] = [];
  let status: CalibrationVerdict["status"];
  if (evaluated.length === 0) {
    status = "unmeasured";
    reasons.push("No reliable human-checked reference exists for this book and configuration.");
  } else if (evaluated.length < thresholds.minCalibrationPages) {
    status = "insufficient_samples";
    reasons.push(`${evaluated.length} reliable samples, ${thresholds.minCalibrationPages} required.`);
  } else if (missing.length > 0) {
    status = "insufficient_coverage";
    reasons.push(`Required strata not covered by reliable samples: ${missing.join(", ")}.`);
  } else if (gateAggregate && (gateAggregate.cer > thresholds.maxCer || gateAggregate.wer > thresholds.maxWer || gateAggregate.criticalErrorRate > thresholds.maxCriticalErrorRate)) {
    status = "failed";
    if (gateAggregate.cer > thresholds.maxCer) reasons.push(`CER ${(gateAggregate.cer * 100).toFixed(2)}% exceeds ${(thresholds.maxCer * 100).toFixed(2)}%.`);
    if (gateAggregate.wer > thresholds.maxWer) reasons.push(`WER ${(gateAggregate.wer * 100).toFixed(2)}% exceeds ${(thresholds.maxWer * 100).toFixed(2)}%.`);
    if (gateAggregate.criticalErrorRate > thresholds.maxCriticalErrorRate) reasons.push(`Critical-token error rate ${(gateAggregate.criticalErrorRate * 100).toFixed(2)}% exceeds ${(thresholds.maxCriticalErrorRate * 100).toFixed(2)}%. Critical tokens are negations, exceptions, glossary legal terms and numbers.`);
  } else {
    status = "passed";
    reasons.push("Aggregate CER, WER and critical-token error rate are within the configured thresholds on the reliable samples.");
  }
  if (thresholds.loosened) reasons.push("Thresholds were loosened with OCR_ALLOW_LOOSE_THRESHOLDS.");

  const firstOcr = ocrRecords.find((record) => record.ocr?.engine === "tesseract")?.ocr ?? ocrRecords.find((record) => record.ocr)?.ocr ?? null;
  return {
    schemaVersion: 1,
    bookId: input.bookId,
    sourceSha256: input.sourceSha256,
    configHash: input.configHash,
    language: input.language,
    ocrLanguages: input.ocrLanguages,
    ocrEngine: firstOcr?.engine ?? null,
    ocrEngineVersion: firstOcr?.engineVersion ?? null,
    traineddata: firstOcr?.traineddata ?? {},
    edition: editions.size === 1 ? Array.from(editions)[0] ?? null : editions.size > 1 ? Array.from(editions).join(" / ") : null,
    evaluatedAt: (input.now ?? new Date()).toISOString(),
    samples: results,
    aggregate: { strict: strictAggregate, folded: foldedAggregate },
    reliableSampleCount: evaluated.length,
    missingReferences: results.filter((item) => item.status === "missing_reference").map((item) => item.pdfPage),
    excludedSamples: results.filter((item) => item.status === "excluded").map((item) => ({ pdfPage: item.pdfPage, reasons: item.exclusionReasons })),
    coverage: { required, covered, missing, notes: coverageNotes },
    verdict: { status, reasons, gateMetric: thresholds.gateMetric, thresholds },
    failedPages: evaluated.filter((item) => item.pagePassed === false).map((item) => item.pdfPage),
    normalization: NORMALIZATION_NOTE,
  };
}

function pct(value: number | undefined): string {
  return value === undefined ? "-" : `${(value * 100).toFixed(2)}%`;
}

export function renderCalibrationMarkdown(report: CalibrationReport): string {
  const lines = [
    `# OCR accuracy evaluation: ${report.bookId}`,
    "",
    `- Verdict: **${report.verdict.status}**`,
    ...report.verdict.reasons.map((reason) => `  - ${reason}`),
    `- Source SHA-256: ${report.sourceSha256}`,
    `- Language: ${report.language}. OCR languages: ${report.ocrLanguages}`,
    `- OCR engine: ${report.ocrEngine ? `${report.ocrEngine} ${report.ocrEngineVersion}` : "none recorded"}. Language data fingerprints: ${JSON.stringify(report.traineddata)}`,
    `- Edition named by reviewers: ${report.edition ?? "not recorded"}`,
    `- Evaluated: ${report.evaluatedAt}`,
    `- Reliable samples: ${report.reliableSampleCount}`,
    "",
    "## Aggregate metrics",
    "",
    "| Mode | CER | WER | Critical-token errors | Reference chars | Reference words |",
    "| --- | --- | --- | --- | --- | --- |",
    `| strict | ${pct(report.aggregate.strict?.cer)} | ${pct(report.aggregate.strict?.wer)} | ${report.aggregate.strict ? `${report.aggregate.strict.criticalErrors}/${report.aggregate.strict.criticalReferenceTokens} (${pct(report.aggregate.strict.criticalErrorRate)})` : "-"} | ${report.aggregate.strict?.referenceChars ?? "-"} | ${report.aggregate.strict?.referenceWords ?? "-"} |`,
    `| folded | ${pct(report.aggregate.folded?.cer)} | ${pct(report.aggregate.folded?.wer)} | ${report.aggregate.folded ? `${report.aggregate.folded.criticalErrors}/${report.aggregate.folded.criticalReferenceTokens} (${pct(report.aggregate.folded.criticalErrorRate)})` : "-"} | ${report.aggregate.folded?.referenceChars ?? "-"} | ${report.aggregate.folded?.referenceWords ?? "-"} |`,
    "",
    `Thresholds: CER <= ${pct(report.verdict.thresholds.maxCer)}, WER <= ${pct(report.verdict.thresholds.maxWer)}, critical <= ${pct(report.verdict.thresholds.maxCriticalErrorRate)}, per page CER <= ${pct(report.verdict.thresholds.maxPageCer)}, at least ${report.verdict.thresholds.minCalibrationPages} reliable pages. Gate metric: ${report.verdict.gateMetric}.`,
    "",
    "## Samples",
    "",
    "| PDF page | Strata | Status | Strict CER | Strict WER | Folded CER | Page result | Notes |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const sample of report.samples) {
    lines.push(`| ${sample.pdfPage} | ${sample.strata.join(", ")} | ${sample.status} | ${pct(sample.strict?.cer)} | ${pct(sample.strict?.wer)} | ${pct(sample.folded?.cer)} | ${sample.pagePassed === null ? "-" : sample.pagePassed ? "pass" : "fail"} | ${sample.exclusionReasons.join("; ")} |`);
  }
  lines.push("", "## Gaps", "");
  lines.push(`- Missing references: ${report.missingReferences.length === 0 ? "none" : report.missingReferences.join(", ")}`);
  lines.push(`- Unreliable references excluded: ${report.excludedSamples.length === 0 ? "none" : report.excludedSamples.map((item) => item.pdfPage).join(", ")}`);
  lines.push(`- Required strata: ${report.coverage.required.join(", ")}. Missing: ${report.coverage.missing.join(", ") || "none"}`);
  for (const note of report.coverage.notes) lines.push(`- ${note}`);
  lines.push("", "## Normalization", "", report.normalization, "");
  return `${lines.join("\n")}\n`;
}

export async function saveCalibrationReport(outputDir: string, report: CalibrationReport): Promise<string> {
  const dir = calibrationDir(outputDir);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  await writeFile(path.join(dir, "report.md"), renderCalibrationMarkdown(report), "utf8");
  return path.join(dir, "report.md");
}
