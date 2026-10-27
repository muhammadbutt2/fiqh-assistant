import { spawn } from "child_process";
import { createHash } from "crypto";
import { existsSync, readdirSync, readFileSync } from "fs";
import { mkdir, mkdtemp, readFile, rm } from "fs/promises";
import path from "path";
import type { EnvMap, OcrConfig } from "@/server/ocr/config";
import { OcrError } from "@/server/ocr/errors";

export type ExecResult = { code: number | null; stdout: string; stderr: string; error?: NodeJS.ErrnoException; timedOut: boolean };
export type Exec = (command: string, args: string[], options?: { env?: EnvMap; timeoutMs?: number; input?: Uint8Array }) => Promise<ExecResult>;

export const defaultExec: Exec = (command, args, options = {}) =>
  new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const finish = (result: ExecResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const child = spawn(command, args, { env: (options.env ?? process.env) as NodeJS.ProcessEnv, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs ?? 60_000);
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error: NodeJS.ErrnoException) => finish({ code: null, stdout, stderr, error, timedOut }));
    child.on("close", (code) => finish({ code, stdout, stderr, timedOut }));
    child.stdin.on("error", () => undefined);
    if (options.input) child.stdin.end(Buffer.from(options.input));
    else child.stdin.end();
  });

export type EngineInfo = {
  command: string;
  version: string;
  tessdataDir: string | null;
  tessdataSource: "TESSDATA_PREFIX" | "project .data/tessdata" | "engine default";
  installedLanguages: string[];
  traineddata: Record<string, string>;
};

export type EngineInspection =
  | { ok: true; info: EngineInfo; warnings: string[] }
  | { ok: false; error: OcrError; warnings: string[] };

function hasTraineddata(dir: string): boolean {
  try {
    return readdirSync(dir).some((name) => name.endsWith(".traineddata"));
  } catch {
    return false;
  }
}

function windowsCandidates(env: EnvMap): string[] {
  const roots = [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, "Programs") : undefined, env.ProgramW6432];
  return roots.filter((root): root is string => Boolean(root)).map((root) => path.join(root, "Tesseract-OCR", "tesseract.exe"));
}

export function resolveTessdata(config: OcrConfig, cwd: string, env: EnvMap): { dir: string | null; source: EngineInfo["tessdataSource"]; warning?: string } {
  let warning: string | undefined;
  if (config.tessdataDir) {
    if (hasTraineddata(config.tessdataDir)) return { dir: config.tessdataDir, source: "TESSDATA_PREFIX" };
    warning = `TESSDATA_PREFIX=${config.tessdataDir} does not contain any .traineddata files. It must point at the folder that holds them. Falling back.`;
  }
  const projectDir = path.resolve(cwd, ".data", "tessdata");
  if (hasTraineddata(projectDir)) return { dir: projectDir, source: "project .data/tessdata", warning };
  void env;
  return { dir: null, source: "engine default", warning };
}

export function parseVersion(output: string): string | null {
  const match = output.match(/tesseract\s+v?(\d[\w.\-]*)/i);
  return match?.[1] ?? null;
}

export function parseLanguages(output: string): string[] {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.filter((line) => !/^list of available languages/i.test(line) && /^[A-Za-z0-9_]+$/.test(line));
}

export function installHint(languages: string[]): string {
  const files = languages.map((lang) => `Invoke-WebRequest https://github.com/tesseract-ocr/tessdata_best/raw/main/${lang}.traineddata -OutFile .data\\tessdata\\${lang}.traineddata`);
  return [
    "Install the missing language data from the official tessdata_best repository (run from the project folder):",
    "New-Item -ItemType Directory -Force .data\\tessdata | Out-Null",
    ...files,
    "The pipeline reads .data/tessdata automatically. To use another folder set TESSDATA_PREFIX to the folder that contains the .traineddata files.",
  ].join("\n");
}

export async function inspectEngine(
  config: OcrConfig,
  options: { exec?: Exec; cwd?: string; env?: EnvMap } = {},
): Promise<EngineInspection> {
  const exec = options.exec ?? defaultExec;
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const warnings: string[] = [];
  const candidates = [config.tesseractCmd, "tesseract", ...windowsCandidates(env)].filter((item): item is string => Boolean(item));
  let command: string | null = null;
  let version: string | null = null;
  let sawNotExecutable: string | null = null;

  for (const candidate of Array.from(new Set(candidates))) {
    const result = await exec(candidate, ["--version"], { env, timeoutMs: 15_000 });
    if (result.error) {
      if (result.error.code === "EACCES" || result.error.code === "EPERM") sawNotExecutable = candidate;
      continue;
    }
    const parsed = parseVersion(`${result.stdout}\n${result.stderr}`);
    if (result.code === 0 && parsed) {
      command = candidate;
      version = parsed;
      break;
    }
  }

  if (!command || !version) {
    if (sawNotExecutable) {
      return {
        ok: false,
        warnings,
        error: new OcrError("OCR_ENGINE_NOT_EXECUTABLE", `Tesseract was found at ${sawNotExecutable} but could not be run (permission denied).`, "Check file permissions or run the terminal as a user that can execute it."),
      };
    }
    const configured = config.tesseractCmd ? ` TESSERACT_CMD is set to ${config.tesseractCmd}, which could not be run.` : "";
    return {
      ok: false,
      warnings,
      error: new OcrError(
        "OCR_ENGINE_UNAVAILABLE",
        `Tesseract is not installed or not reachable.${configured} OCR was not performed.`,
        "Install it with: winget install -e --id UB-Mannheim.TesseractOCR . Then open a new terminal, or set TESSERACT_CMD to the full path of tesseract.exe in .env.",
      ),
    };
  }

  const tessdata = resolveTessdata(config, cwd, env);
  if (tessdata.warning) warnings.push(tessdata.warning);
  const runEnv = tessdata.dir ? { ...env, TESSDATA_PREFIX: tessdata.dir } : env;
  const list = await exec(command, ["--list-langs"], { env: runEnv, timeoutMs: 20_000 });
  const installedLanguages = parseLanguages(`${list.stdout}\n${list.stderr}`);
  const traineddata: Record<string, string> = {};
  if (tessdata.dir) {
    for (const lang of installedLanguages) {
      const file = path.join(tessdata.dir, `${lang}.traineddata`);
      if (existsSync(file)) traineddata[lang] = createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 16);
    }
  }
  return { ok: true, warnings, info: { command, version, tessdataDir: tessdata.dir, tessdataSource: tessdata.source, installedLanguages, traineddata } };
}

export function requireLanguages(info: EngineInfo, languages: string): void {
  const wanted = languages.split("+").filter(Boolean);
  const missing = wanted.filter((lang) => !info.installedLanguages.includes(lang));
  if (missing.length > 0) {
    throw new OcrError(
      "OCR_LANGUAGE_DATA_MISSING",
      `Tesseract language data is missing for: ${missing.join(", ")}. Installed: ${info.installedLanguages.join(", ") || "none"}. OCR was not performed.`,
      installHint(missing),
    );
  }
}

export type OcrPageResult = {
  text: string;
  meanConfidence: number | null;
  wordCount: number;
  rotationDegrees: number;
  rotationNote: string | null;
  elapsedMs: number;
};

export type RecognizeOptions = {
  languages: string;
  psm: number;
  timeoutMs: number;
  detectRotation: boolean;
  threadsPerJob: number;
  tmpDir: string;
  rotate?: (image: Uint8Array, degrees: number) => Promise<Uint8Array>;
};

export type OcrEngine = {
  info: EngineInfo;
  recognize: (image: Uint8Array, options: RecognizeOptions) => Promise<OcrPageResult>;
};

export function parseTsv(tsv: string): { meanConfidence: number | null; wordCount: number } {
  const lines = tsv.split(/\r?\n/).slice(1);
  let total = 0;
  let count = 0;
  for (const line of lines) {
    const cols = line.split("\t");
    if (cols.length < 12 || cols[0] !== "5") continue;
    const text = cols.slice(11).join("\t").trim();
    const conf = Number(cols[10]);
    if (!text || !Number.isFinite(conf) || conf < 0) continue;
    total += conf;
    count++;
  }
  return { meanConfidence: count === 0 ? null : total / count, wordCount: count };
}

export function parseOsd(output: string): { rotate: number; confidence: number } | null {
  const rotate = output.match(/Rotate:\s*(\d+)/);
  const confidence = output.match(/Orientation confidence:\s*([\d.]+)/);
  if (!rotate || !confidence) return null;
  return { rotate: Number(rotate[1]), confidence: Number(confidence[1]) };
}

export function createTesseractEngine(info: EngineInfo, exec: Exec = defaultExec): OcrEngine {
  const baseEnv = (threads: number): EnvMap => ({
    ...process.env,
    ...(info.tessdataDir ? { TESSDATA_PREFIX: info.tessdataDir } : {}),
    ...(threads > 0 ? { OMP_THREAD_LIMIT: String(threads) } : {}),
  });

  async function run(image: Uint8Array, args: string[], options: RecognizeOptions, outputExtensions: string[]): Promise<{ files: Record<string, string>; result: ExecResult }> {
    await mkdir(options.tmpDir, { recursive: true });
    const dir = await mkdtemp(path.join(options.tmpDir, "job-"));
    try {
      const base = path.join(dir, "page");
      const result = await exec(info.command, ["stdin", base, ...args], { env: baseEnv(options.threadsPerJob), timeoutMs: options.timeoutMs, input: image });
      const files: Record<string, string> = {};
      for (const ext of outputExtensions) {
        try {
          files[ext] = await readFile(`${base}.${ext}`, "utf8");
        } catch {
          // The caller decides whether a missing output file is an error.
        }
      }
      return { files, result };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  return {
    info,
    async recognize(image, options) {
      const started = Date.now();
      let rotationDegrees = 0;
      let rotationNote: string | null = null;
      let source = image;
      if (options.detectRotation) {
        if (!info.installedLanguages.includes("osd")) {
          rotationNote = "Rotation detection skipped: osd.traineddata is not installed.";
        } else if (!options.rotate) {
          rotationNote = "Rotation detection skipped: no rotate function supplied.";
        } else {
          const osd = await run(image, ["--psm", "0", "-l", "osd"], options, ["osd"]);
          const parsed = parseOsd(osd.files.osd ?? osd.result.stdout + osd.result.stderr);
          if (!parsed) rotationNote = "Rotation detection returned no result for this page.";
          else if (parsed.rotate !== 0 && parsed.confidence >= 2) {
            source = await options.rotate(image, parsed.rotate);
            rotationDegrees = parsed.rotate;
            rotationNote = `Rotated ${parsed.rotate} degrees clockwise (orientation confidence ${parsed.confidence}).`;
          } else rotationNote = `No rotation applied (rotate ${parsed.rotate}, confidence ${parsed.confidence}).`;
        }
      }
      const { files, result } = await run(source, ["-l", options.languages, "--psm", String(options.psm), "-c", "tessedit_create_txt=1", "-c", "tessedit_create_tsv=1"], options, ["txt", "tsv"]);
      if (result.error) {
        const code = result.error.code === "EACCES" || result.error.code === "EPERM" ? "OCR_ENGINE_NOT_EXECUTABLE" : "OCR_ENGINE_UNAVAILABLE";
        throw new OcrError(code, `Could not run Tesseract: ${result.error.message}`);
      }
      if (result.timedOut) throw new OcrError("OCR_TIMEOUT", `Tesseract exceeded ${options.timeoutMs} ms on one page.`, "Raise OCR_TIMEOUT_MS or lower OCR_RENDER_DPI.");
      if (result.code !== 0 || files.txt === undefined) {
        throw new OcrError("OCR_FAILED", `Tesseract exited with code ${result.code}: ${(result.stderr || result.stdout).trim().slice(0, 300)}`);
      }
      const { meanConfidence, wordCount } = parseTsv(files.tsv ?? "");
      return { text: files.txt, meanConfidence, wordCount, rotationDegrees, rotationNote, elapsedMs: Date.now() - started };
    },
  };
}
