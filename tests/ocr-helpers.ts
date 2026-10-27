import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { loadOcrConfig, type OcrConfig } from "@/server/ocr/config";
import type { PipelineDeps } from "@/server/ocr/pipeline";
import { openPdf } from "@/server/ocr/render";
import type { EngineInfo, OcrEngine, OcrPageResult } from "@/server/ocr/tesseract";

export const ENGLISH_LINES = [
  "The rule of the school is that the water in the vessel is pure and it is lawful to use it for the wudu of the body.",
  "It is said that the one who prays in the state of purity is not asked to repeat it and that is the view of the scholars.",
  "The people of the city agree on this and they follow it in the matter of the prayer and the fast of the month.",
];

export async function makePdf(pages: (string[] | null)[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const lines of pages) {
    const page = pdf.addPage([600, 800]);
    (lines ?? []).forEach((line, index) => page.drawText(`${line} `, { x: 20, y: 760 - index * 20, size: 8, font }));
  }
  return pdf.save();
}

export const ARABIC_SENTENCES = [
  "قال الإمام في كتاب الطهارة إن الماء الطاهر لا ينجس إلا إذا تغير أحد أوصافه وما كان على الأرض من الماء فلا يجوز به الوضوء",
  "وقال أبو حنيفة رحمه الله في هذا الباب إن من لم يجد الماء فإنه يتيمم بالصعيد الطيب ثم يصلي ولا إعادة عليه عند أكثر أهل العلم",
  "ثم ذكر المصنف أن المسافر إذا نوى الإقامة خمسة عشر يوما أتم الصلاة وإن لم ينو ذلك قصر في كل ما كان من السفر",
];

export function arabicPage(index: number): string {
  return ARABIC_SENTENCES.map((sentence, offset) => `${sentence} ${index * 3 + offset}`).join("\n");
}

export const FAKE_INFO: EngineInfo = {
  command: "fake-tesseract",
  version: "5.4.0-test",
  tessdataDir: "/fake/tessdata",
  tessdataSource: "project .data/tessdata",
  installedLanguages: ["ara", "urd", "eng"],
  traineddata: { ara: "aaaa", urd: "uuuu", eng: "eeee" },
};

export type FakeEngine = OcrEngine & { calls: number[] };

export function fakeEngine(
  handler: (page: number) => Partial<OcrPageResult> | Promise<Partial<OcrPageResult>>,
  info: EngineInfo = FAKE_INFO,
): FakeEngine {
  const calls: number[] = [];
  return {
    info,
    calls,
    async recognize(image) {
      const page = image[0] as number;
      calls.push(page);
      const result = await handler(page);
      return { text: "", meanConfidence: 90, wordCount: 40, rotationDegrees: 0, rotationNote: null, elapsedMs: 1, ...result };
    },
  };
}

export function testDeps(engine: OcrEngine | (() => Promise<OcrEngine>)): PipelineDeps {
  return {
    openPdf: async (bytes) => {
      const real = await openPdf(bytes);
      return { ...real, render: async (page) => ({ png: new Uint8Array([page]), width: 100, height: 100, scale: 1 }) };
    },
    engine: typeof engine === "function" ? engine : async () => engine,
  };
}

export async function tempConfig(overrides: Record<string, string> = {}): Promise<{ config: OcrConfig; dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(tmpdir(), "fiqh-ocr-"));
  const config = loadOcrConfig(
    {
      OCR_DATA_DIR: path.join(dir, "ocr"),
      OCR_CONCURRENCY: "1",
      OCR_BATCH_SIZE: "2",
      OCR_MIN_CALIBRATION_PAGES: "6",
      OCR_MIN_REFERENCE_CHARS: "100",
      ...overrides,
    },
    dir,
  );
  return { config, dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}
