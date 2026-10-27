import path from "path";
import { OcrError } from "@/server/ocr/errors";

export type Thresholds = {
  maxCer: number;
  maxWer: number;
  maxCriticalErrorRate: number;
  maxPageCer: number;
  minCalibrationPages: number;
  minReferenceChars: number;
  minPageConfidence: number;
  poorConfidence: number;
  gateMetric: "strict" | "folded";
  loosened: boolean;
};

export type OcrConfig = {
  tesseractCmd: string | null;
  tessdataDir: string | null;
  fallbackLanguages: string;
  dpi: number;
  maxRenderPixels: number;
  psm: number;
  detectRotation: boolean;
  timeoutMs: number;
  concurrency: number;
  threadsPerJob: number;
  batchSize: number;
  pilotMaxPages: number;
  dataDir: string;
  thresholds: Thresholds;
};

// Ceilings the gate refuses to exceed unless OCR_ALLOW_LOOSE_THRESHOLDS=true. The override is recorded in every report.
export const THRESHOLD_CEILINGS = { maxCer: 0.1, maxWer: 0.25, maxCriticalErrorRate: 0.05, maxPageCer: 0.25, minCalibrationPagesFloor: 6 } as const;

export type EnvMap = Record<string, string | undefined>;

function num(env: EnvMap, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new OcrError("CONFIG_INVALID", `${name}=${JSON.stringify(raw)} is not a number between ${min} and ${max}.`);
  }
  return value;
}

function bool(env: EnvMap, name: string, fallback: boolean): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "true" || raw === "1" || raw === "yes";
}

export function cleanPathEnv(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/^"(.*)"$/, "$1").trim();
  return trimmed ? trimmed : null;
}

export function validateLanguages(value: string): string {
  const cleaned = value.trim();
  if (!/^[A-Za-z0-9_]+(\+[A-Za-z0-9_]+)*$/.test(cleaned)) {
    throw new OcrError("CONFIG_INVALID", `OCR language ${JSON.stringify(value)} is not valid. Use Tesseract codes joined with +, for example ara or urd+ara.`);
  }
  return cleaned;
}

export function loadOcrConfig(env: EnvMap = process.env, cwd: string = process.cwd()): OcrConfig {
  const loose = bool(env, "OCR_ALLOW_LOOSE_THRESHOLDS", false);
  const thresholds: Thresholds = {
    maxCer: num(env, "OCR_MAX_CER", 0.05, 0, 1),
    maxWer: num(env, "OCR_MAX_WER", 0.15, 0, 1),
    maxCriticalErrorRate: num(env, "OCR_MAX_CRITICAL_ERROR_RATE", 0.03, 0, 1),
    maxPageCer: num(env, "OCR_MAX_PAGE_CER", 0.15, 0, 1),
    minCalibrationPages: num(env, "OCR_MIN_CALIBRATION_PAGES", 10, 1, 10_000),
    minReferenceChars: num(env, "OCR_MIN_REFERENCE_CHARS", 150, 1, 100_000),
    minPageConfidence: num(env, "OCR_MIN_PAGE_CONFIDENCE", 60, 0, 100),
    poorConfidence: num(env, "OCR_POOR_CONFIDENCE", 75, 0, 100),
    gateMetric: env.OCR_GATE_METRIC?.trim().toLowerCase() === "folded" ? "folded" : "strict",
    loosened: false,
  };
  const breaches: string[] = [];
  if (thresholds.maxCer > THRESHOLD_CEILINGS.maxCer) breaches.push(`OCR_MAX_CER ${thresholds.maxCer} > ${THRESHOLD_CEILINGS.maxCer}`);
  if (thresholds.maxWer > THRESHOLD_CEILINGS.maxWer) breaches.push(`OCR_MAX_WER ${thresholds.maxWer} > ${THRESHOLD_CEILINGS.maxWer}`);
  if (thresholds.maxCriticalErrorRate > THRESHOLD_CEILINGS.maxCriticalErrorRate) breaches.push(`OCR_MAX_CRITICAL_ERROR_RATE ${thresholds.maxCriticalErrorRate} > ${THRESHOLD_CEILINGS.maxCriticalErrorRate}`);
  if (thresholds.maxPageCer > THRESHOLD_CEILINGS.maxPageCer) breaches.push(`OCR_MAX_PAGE_CER ${thresholds.maxPageCer} > ${THRESHOLD_CEILINGS.maxPageCer}`);
  if (thresholds.minCalibrationPages < THRESHOLD_CEILINGS.minCalibrationPagesFloor) breaches.push(`OCR_MIN_CALIBRATION_PAGES ${thresholds.minCalibrationPages} < ${THRESHOLD_CEILINGS.minCalibrationPagesFloor}`);
  if (breaches.length > 0) {
    if (!loose) {
      throw new OcrError(
        "CONFIG_INVALID",
        `Refusing to loosen the OCR quality gate: ${breaches.join("; ")}.`,
        "Set OCR_ALLOW_LOOSE_THRESHOLDS=true only if you accept that every report and indexed document will be marked as using loosened thresholds.",
      );
    }
    thresholds.loosened = true;
  }

  const concurrency = Math.floor(num(env, "OCR_CONCURRENCY", 2, 1, 16));
  return {
    tesseractCmd: cleanPathEnv(env.TESSERACT_CMD),
    tessdataDir: cleanPathEnv(env.TESSDATA_PREFIX),
    fallbackLanguages: validateLanguages(env.OCR_LANGUAGES?.trim() || "ara+urd"),
    dpi: num(env, "OCR_RENDER_DPI", 300, 72, 600),
    maxRenderPixels: num(env, "OCR_MAX_RENDER_PIXELS", 12_000_000, 500_000, 60_000_000),
    psm: Math.floor(num(env, "OCR_PSM", 3, 0, 13)),
    detectRotation: bool(env, "OCR_DETECT_ROTATION", false),
    timeoutMs: num(env, "OCR_TIMEOUT_MS", 180_000, 5_000, 3_600_000),
    concurrency,
    threadsPerJob: Math.floor(num(env, "OCR_THREADS_PER_JOB", concurrency > 1 ? 1 : 0, 0, 64)),
    batchSize: Math.floor(num(env, "OCR_BATCH_SIZE", 20, 1, 1000)),
    pilotMaxPages: Math.floor(num(env, "OCR_PILOT_MAX_PAGES", 40, 1, 500)),
    dataDir: path.resolve(cwd, cleanPathEnv(env.OCR_DATA_DIR) ?? path.join(".data", "ocr")),
    thresholds,
  };
}
