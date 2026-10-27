export type OcrErrorCode =
  | "OCR_ENGINE_UNAVAILABLE"
  | "OCR_ENGINE_NOT_EXECUTABLE"
  | "OCR_LANGUAGE_DATA_MISSING"
  | "OCR_TIMEOUT"
  | "OCR_FAILED"
  | "PDF_CORRUPT"
  | "PDF_RENDER_FAILED"
  | "CONFIG_INVALID";

export class OcrError extends Error {
  readonly code: OcrErrorCode;
  readonly hint: string | null;

  constructor(code: OcrErrorCode, message: string, hint: string | null = null) {
    super(message);
    this.name = "OcrError";
    this.code = code;
    this.hint = hint;
  }
}

export function describeError(error: unknown): { code: string; message: string; hint: string | null } {
  if (error instanceof OcrError) return { code: error.code, message: error.message, hint: error.hint };
  if (error instanceof Error) return { code: "OCR_FAILED", message: error.message, hint: null };
  return { code: "OCR_FAILED", message: "Unknown error", hint: null };
}
