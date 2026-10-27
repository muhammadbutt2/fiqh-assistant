import { createHash } from "crypto";
import { readdir, readFile, stat } from "fs/promises";
import path from "path";
import { booksDirectory, loadProjectEnv } from "../src/server/ocr/runtime";

async function main() {
  loadProjectEnv();
  const root = booksDirectory();
  const names = (await readdir(root)).filter((name) => name.toLowerCase().endsWith(".pdf")).sort();
  const rows = [];

  for (const name of names) {
    const full = path.join(root, name);
    const info = await stat(full);
    const bytes = await readFile(full);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    let pageCount: number | null = null;
    let pdfTitle: string | null = null;
    let pdfAuthor: string | null = null;
    let error: string | null = null;
    try {
      const { getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      pageCount = pdf.numPages;
      const metadata = await pdf.getMetadata();
      const infoDict = metadata?.info as { Title?: string; Author?: string } | undefined;
      pdfTitle = typeof infoDict?.Title === "string" ? infoDict.Title.slice(0, 180) : null;
      pdfAuthor = typeof infoDict?.Author === "string" ? infoDict.Author.slice(0, 180) : null;
    } catch (caught) {
      error = caught instanceof Error ? caught.name : "METADATA_UNAVAILABLE";
    }
    rows.push({ fileName: name, bytes: info.size, sha256, pageCount, pdfTitle, pdfAuthor, error });
  }

  console.log(JSON.stringify(rows, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "INVENTORY_FAILED");
  process.exit(1);
});
