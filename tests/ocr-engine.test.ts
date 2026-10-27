import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { assessText, scriptForLanguage } from "@/server/ocr/assess";
import { describeBook } from "@/server/ocr/books";
import { loadOcrConfig, validateLanguages } from "@/server/ocr/config";
import { OcrError } from "@/server/ocr/errors";
import { aggregateMetrics, evaluatePair, foldedForm, strictForm } from "@/server/ocr/metrics";
import { createTesseractEngine, inspectEngine, parseLanguages, parseOsd, parseTsv, requireLanguages, type Exec, type ExecResult } from "@/server/ocr/tesseract";
import { ARABIC_SENTENCES, ENGLISH_LINES, FAKE_INFO } from "./ocr-helpers";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const ok = (stdout: string, stderr = ""): ExecResult => ({ code: 0, stdout, stderr, timedOut: false });
const enoent = (): ExecResult => ({ code: null, stdout: "", stderr: "", timedOut: false, error: Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }) as NodeJS.ErrnoException });

describe("Tesseract discovery", () => {
  it("returns an actionable error when Tesseract is missing and tries the Windows install folders", async () => {
    const tried: string[] = [];
    const exec: Exec = async (command) => {
      tried.push(command);
      return enoent();
    };
    const config = loadOcrConfig({}, tmpdir());
    const result = await inspectEngine(config, { exec, env: { ProgramFiles: "C:\\Program Files", LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local" }, cwd: tmpdir() });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("OCR_ENGINE_UNAVAILABLE");
      expect(result.error.message).toContain("OCR was not performed");
      expect(result.error.hint).toContain("winget install -e --id UB-Mannheim.TesseractOCR");
    }
    expect(tried[0]).toBe("tesseract");
    expect(tried.some((item) => item.endsWith(path.join("Tesseract-OCR", "tesseract.exe")))).toBe(true);
  });

  it("reports a permission problem separately from a missing install", async () => {
    const exec: Exec = async () => ({ code: null, stdout: "", stderr: "", timedOut: false, error: Object.assign(new Error("EACCES"), { code: "EACCES" }) as NodeJS.ErrnoException });
    const result = await inspectEngine(loadOcrConfig({}, tmpdir()), { exec, env: {}, cwd: tmpdir() });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("OCR_ENGINE_NOT_EXECUTABLE");
  });

  it("honours TESSERACT_CMD with quotes and reads version and languages", async () => {
    const calls: string[][] = [];
    const exec: Exec = async (command, args) => {
      calls.push([command, ...args]);
      if (args[0] === "--version") return ok("tesseract v5.4.0.20240606\n leptonica-1.84.1");
      return ok('List of available languages in "/x/" (2):\nara\neng\n');
    };
    const config = loadOcrConfig({ TESSERACT_CMD: '"D:\\ocr\\tesseract.exe"' }, tmpdir());
    const result = await inspectEngine(config, { exec, env: {}, cwd: tmpdir() });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.info.command).toBe("D:\\ocr\\tesseract.exe");
      expect(result.info.version).toBe("5.4.0.20240606");
      expect(result.info.installedLanguages).toEqual(["ara", "eng"]);
    }
  });

  it("flags missing Arabic or Urdu traineddata with the official install commands", () => {
    const info = { ...FAKE_INFO, installedLanguages: ["eng"] };
    try {
      requireLanguages(info, "urd+ara");
      throw new Error("should not pass");
    } catch (error) {
      expect(error).toBeInstanceOf(OcrError);
      const detail = error as OcrError;
      expect(detail.code).toBe("OCR_LANGUAGE_DATA_MISSING");
      expect(detail.message).toContain("urd, ara");
      expect(detail.hint).toContain("https://github.com/tesseract-ocr/tessdata_best/raw/main/ara.traineddata");
      expect(detail.hint).toContain("urd.traineddata");
    }
    expect(() => requireLanguages(FAKE_INFO, "urd+ara")).not.toThrow();
  });

  it("warns when TESSDATA_PREFIX points at a folder without traineddata", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "fiqh-tess-"));
    dirs.push(dir);
    const exec: Exec = async (_command, args) => (args[0] === "--version" ? ok("tesseract 5.3.0") : ok("List of available languages (1):\neng\n"));
    const result = await inspectEngine(loadOcrConfig({ TESSDATA_PREFIX: dir }, dir), { exec, env: {}, cwd: dir });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warnings.join(" ")).toContain("does not contain any .traineddata");
  });

  it("parses Tesseract output formats", () => {
    expect(parseLanguages('List of available languages in "/x" (3):\nara\nosd\nurd\n')).toEqual(["ara", "osd", "urd"]);
    const tsv = ["level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext", "5\t1\t1\t1\t1\t1\t0\t0\t5\t5\t90\tكلمة", "5\t1\t1\t1\t1\t2\t0\t0\t5\t5\t70\tأخرى", "5\t1\t1\t1\t1\t3\t0\t0\t5\t5\t-1\t", "4\t1\t1\t1\t1\t0\t0\t0\t5\t5\t-1\t"].join("\n");
    expect(parseTsv(tsv)).toEqual({ meanConfidence: 80, wordCount: 2 });
    expect(parseOsd("Page number: 0\nOrientation in degrees: 270\nRotate: 90\nOrientation confidence: 5.20\n")).toEqual({ rotate: 90, confidence: 5.2 });
  });

  it("maps OCR timeouts and nonzero exits to coded errors and reads confidence from the TSV", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "fiqh-eng-"));
    dirs.push(dir);
    const options = { languages: "ara", psm: 3, timeoutMs: 1000, detectRotation: false, threadsPerJob: 1, tmpDir: dir };
    const timeout: Exec = async () => ({ code: null, stdout: "", stderr: "", timedOut: true });
    await expect(createTesseractEngine(FAKE_INFO, timeout).recognize(new Uint8Array([1]), options)).rejects.toMatchObject({ code: "OCR_TIMEOUT" });
    const failing: Exec = async () => ({ code: 1, stdout: "", stderr: "Error opening data file", timedOut: false });
    await expect(createTesseractEngine(FAKE_INFO, failing).recognize(new Uint8Array([1]), options)).rejects.toMatchObject({ code: "OCR_FAILED" });
    const working: Exec = async (_command, args) => {
      const base = args[1] as string;
      await writeFile(`${base}.txt`, "نص تجريبي", "utf8");
      await writeFile(`${base}.tsv`, "h\n5\t1\t1\t1\t1\t1\t0\t0\t5\t5\t88\tنص", "utf8");
      return ok("");
    };
    const result = await createTesseractEngine(FAKE_INFO, working).recognize(new Uint8Array([1]), options);
    expect(result.text).toBe("نص تجريبي");
    expect(result.meanConfidence).toBe(88);
  });
});

describe("configuration and the quality gate thresholds", () => {
  it("refuses to loosen thresholds silently and records an explicit override", () => {
    expect(() => loadOcrConfig({ OCR_MAX_CER: "0.2" }, tmpdir())).toThrow(/Refusing to loosen/);
    expect(() => loadOcrConfig({ OCR_MIN_CALIBRATION_PAGES: "2" }, tmpdir())).toThrow(/Refusing to loosen/);
    const loose = loadOcrConfig({ OCR_MAX_CER: "0.2", OCR_ALLOW_LOOSE_THRESHOLDS: "true" }, tmpdir());
    expect(loose.thresholds.loosened).toBe(true);
    expect(loadOcrConfig({}, tmpdir()).thresholds.loosened).toBe(false);
    expect(loadOcrConfig({ OCR_MAX_CER: "0.03" }, tmpdir()).thresholds.maxCer).toBe(0.03);
  });

  it("rejects malformed numbers and language codes", () => {
    expect(() => loadOcrConfig({ OCR_RENDER_DPI: "abc" }, tmpdir())).toThrow(/OCR_RENDER_DPI/);
    expect(() => validateLanguages("ara; calc")).toThrow(/not valid/);
    expect(validateLanguages("urd+ara")).toBe("urd+ara");
  });

  it("chooses the OCR language per book instead of always using ara+urd", () => {
    expect(describeBook("al-qaduri.pdf", "x").ocrLanguages).toBe("ara");
    expect(describeBook("alhadayah3.pdf", "x").ocrLanguages).toBe("ara");
    expect(describeBook("fhindia4.pdf", "x").ocrLanguages).toBe("ara");
    const bahishti = describeBook("BahishtiZewarUrduCompletedeobandi--Www.momeen.blogspot.com.pdf", "x");
    expect(bahishti.ocrLanguages).toBe("urd+ara");
    expect(bahishti.language).toBe("ur");
    expect(describeBook("bahishtizewar.pdf", "x", { ocrLanguages: "urd" }).ocrLanguages).toBe("urd");
    expect(() => describeBook("al-qaduri.pdf", "x", { ocrLanguages: "ara;rm" })).toThrow(/not valid/);
  });
});

describe("embedded text assessment for Arabic, Urdu and English", () => {
  it("accepts real Arabic prose and Urdu prose", () => {
    expect(assessText(ARABIC_SENTENCES.join("\n"), "arabic").verdict).toBe("usable");
    const urdu = "نماز پڑھنے والے کے لیے ضروری ہے کہ وہ پاک ہو اور اس کے کپڑے بھی پاک ہوں اور جو شخص پانی نہ پائے وہ تیمم کرے اور پھر نماز ادا کرے کیونکہ یہ حکم سب کے لیے ہے";
    expect(assessText(urdu, "arabic").verdict).toBe("usable");
    expect(assessText(ENGLISH_LINES.join(" "), "latin").verdict).toBe("usable");
  });

  it("rejects a garbled text layer, an empty page, and Latin junk on an Arabic book", () => {
    const junk = "r'9 •. ~)~/a.::,\" rq-f 0 Oi f ~.. Ly~~.JJIJk' ~1~V'(~~.I~14.1 -r'''·~itV. r'44 fl·\" \",";
    const garbled = assessText(junk, "arabic");
    expect(garbled.verdict).toBe("unusable");
    expect(garbled.reason).toContain("expected arabic script");
    expect(assessText("   \n ", "arabic").verdict).toBe("absent");
    const scrambledArabic = "ضصثقفغعهخحجد شسيبلاتنمكط ئءؤرلاىةوزظ ".repeat(20);
    expect(assessText(scrambledArabic, "arabic").verdict).toBe("unusable");
    expect(assessText("\uFFFD".repeat(80) + " ابتث".repeat(5), "arabic").verdict).toBe("unusable");
    expect(scriptForLanguage("urd+ara")).toBe("arabic");
    expect(scriptForLanguage("en")).toBe("latin");
  });
});

describe("OCR accuracy metrics", () => {
  it("computes CER and WER from a known single-character error", () => {
    const reference = "إن الماء الطاهر لا ينجس";
    const metrics = evaluatePair(reference, "إن الماء الطاهر لا ينجش", "strict");
    expect(metrics.charEdits).toBe(1);
    expect(metrics.cer).toBeCloseTo(1 / Array.from(strictForm(reference)).length, 6);
    expect(metrics.wordEdits).toBe(1);
    expect(metrics.wer).toBeCloseTo(1 / 5, 6);
    expect(evaluatePair(reference, reference, "strict").cer).toBe(0);
  });

  it("reports strict and folded metrics separately", () => {
    const reference = "أحكام الماء في الشريعة";
    const hypothesis = "احكام الماء فى الشريعة";
    expect(evaluatePair(reference, hypothesis, "strict").charEdits).toBe(2);
    expect(evaluatePair(reference, hypothesis, "folded").charEdits).toBe(0);
    expect(foldedForm("الصَّلَاةُ")).toBe("الصلاة");
    expect(strictForm("الصَّلَاةُ")).toBe("الصَّلَاةُ");
  });

  it("counts a dropped negation and a changed number as critical-token errors", () => {
    const reference = "لا يجوز الوضوء بماء نجس في الصفحة 12";
    const dropped = evaluatePair(reference, "يجوز الوضوء بماء نجس في الصفحة 12", "strict");
    expect(dropped.criticalErrors).toBeGreaterThanOrEqual(1);
    expect(dropped.criticalErrorRate).toBeGreaterThan(0);
    const number = evaluatePair(reference, "لا يجوز الوضوء بماء نجس في الصفحة 17", "strict");
    expect(number.criticalErrors).toBe(1);
    expect(evaluatePair(reference, reference, "strict").criticalErrors).toBe(0);
  });

  it("aggregates by total edits rather than averaging page rates", () => {
    const a = evaluatePair("abcdefghij", "abcdefghix", "strict");
    const b = evaluatePair("abcdefghijklmnopqrst", "abcdefghijklmnopqrst", "strict");
    const total = aggregateMetrics([a, b], "strict");
    expect(total.cer).toBeCloseTo(1 / 30, 6);
  });
});
