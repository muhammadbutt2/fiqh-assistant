import { createRequire } from "module";
import path from "path";
import { OcrError } from "@/server/ocr/errors";

// The scanned books here are JBIG2 images. The pdf.js copy bundled inside unpdf cannot decode them (pages render
// blank), so the real pdfjs-dist legacy build is used and pointed at its wasm decoders.
export function pdfjsAssetOptions(): { wasmUrl?: string } {
  try {
    const packageJson = createRequire(path.join(process.cwd(), "noop.js")).resolve("pdfjs-dist/package.json");
    return { wasmUrl: `${path.join(path.dirname(packageJson), "wasm").replace(/\\/g, "/")}/` };
  } catch {
    return {};
  }
}

let pdfjsReady: Promise<void> | null = null;
function registerPdfjsDist(): Promise<void> {
  pdfjsReady ??= import("unpdf").then(async ({ definePDFJSModule }) => {
    try {
      await definePDFJSModule(() => import("pdfjs-dist/legacy/build/pdf.mjs"));
    } catch {
      // Falls back to the bundled pdf.js. JBIG2 scans will then render blank and fail the OCR text check.
    }
  });
  return pdfjsReady;
}
export type RenderedPage = { png: Uint8Array; width: number; height: number; scale: number };

export type PdfHandle = {
  numPages: number;
  info: { title: string | null; author: string | null };
  getText: (page: number) => Promise<string>;
  render: (page: number, options: { dpi: number; maxPixels: number }) => Promise<RenderedPage>;
  destroy: () => Promise<void>;
};

export function pngSize(png: Uint8Array): { width: number; height: number } {
  if (png.length < 24 || png[1] !== 0x50 || png[2] !== 0x4e || png[3] !== 0x47) return { width: 0, height: 0 };
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

export function renderScale(pageWidthPts: number, pageHeightPts: number, dpi: number, maxPixels: number): number {
  const wanted = dpi / 72;
  const area = Math.max(pageWidthPts * pageHeightPts, 1);
  const cap = Math.sqrt(maxPixels / area);
  return Math.max(0.25, Math.min(wanted, cap));
}

type PdfProxy = Awaited<ReturnType<typeof import("unpdf").getDocumentProxy>>;

export async function openPdf(bytes: Uint8Array): Promise<PdfHandle> {
  await registerPdfjsDist();
  const { getDocumentProxy, renderPageAsImage } = await import("unpdf");
  let pdf: PdfProxy;
  try {
    // pdf.js takes ownership of the buffer, so it gets its own copy.
    pdf = await getDocumentProxy(new Uint8Array(bytes), { ...pdfjsAssetOptions(), verbosity: 0 });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "PasswordException") throw new OcrError("PDF_CORRUPT", "The PDF is password protected.");
    throw new OcrError("PDF_CORRUPT", `The PDF could not be opened: ${error instanceof Error ? error.message : "unknown error"}.`);
  }
  let title: string | null = null;
  let author: string | null = null;
  try {
    const info = (await pdf.getMetadata())?.info as { Title?: unknown; Author?: unknown } | undefined;
    if (typeof info?.Title === "string" && info.Title.trim()) title = info.Title.trim().slice(0, 240);
    if (typeof info?.Author === "string" && info.Author.trim()) author = info.Author.trim().slice(0, 240);
  } catch {
    // Metadata is optional.
  }
  return {
    numPages: pdf.numPages,
    info: { title, author },
    async getText(pageNumber) {
      const page = await pdf.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        return content.items
          .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : "") : ""))
          .join("");
      } finally {
        page.cleanup();
      }
    },
    async render(pageNumber, options) {
      try {
        const page = await pdf.getPage(pageNumber);
        const view = page.getViewport({ scale: 1 });
        page.cleanup();
        const scale = renderScale(view.width, view.height, options.dpi, options.maxPixels);
        const buffer = await renderPageAsImage(pdf, pageNumber, { canvasImport: () => import("@napi-rs/canvas"), scale });
        const png = new Uint8Array(buffer);
        const size = pngSize(png);
        return { png, width: size.width, height: size.height, scale };
      } catch (error) {
        throw new OcrError("PDF_RENDER_FAILED", `Page ${pageNumber} could not be rendered: ${error instanceof Error ? error.message : "unknown error"}.`, "Check that @napi-rs/canvas is installed (npm install) and the PDF page is not corrupt.");
      }
    },
    async destroy() {
      await (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.();
    },
  };
}

export async function rotatePng(png: Uint8Array, degrees: number): Promise<Uint8Array> {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const image = await loadImage(Buffer.from(png));
  const turn = ((degrees % 360) + 360) % 360;
  const swap = turn === 90 || turn === 270;
  const canvas = createCanvas(swap ? image.height : image.width, swap ? image.width : image.height);
  const context = canvas.getContext("2d");
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((turn * Math.PI) / 180);
  context.drawImage(image, -image.width / 2, -image.height / 2);
  return new Uint8Array(canvas.toBuffer("image/png"));
}
