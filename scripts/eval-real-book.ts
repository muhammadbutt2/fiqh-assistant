import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { parseArgs } from "util";
import { MADHHABS, parseMadhhab } from "../src/server/madhhab";
import { loadProjectEnv, openStore } from "../src/server/ocr/runtime";
import { processQuestion } from "../src/server/query";
import { chunkAllowed, selectChunks } from "../src/server/retrieve";
import type { StoredChunk } from "../src/server/types";

/**
 * Real-book retrieval evaluation.
 *
 * Runs equivalent English, Urdu and Arabic questions against the APPROVED index only and
 * reports whether a passage containing the expected Arabic/Urdu terms appears in the top 5
 * and top 10. It never reads synthetic fixtures and never touches unapproved OCR. When the
 * approved index is empty it says so and writes a report with zero measurable cases.
 *
 * Usage: npm run eval:real-book -- [--madhhab hanafi] [--book <title substring>] [--out .data/eval]
 */

type EvalCase = {
  id: string;
  topic: string;
  questions: { en: string; ur: string; ar: string };
  /** A passage counts as relevant when it contains at least one Arabic form and, if Urdu, one Urdu form. */
  relevantIf: { ar: string[]; ur: string[] };
};

const CASES: EvalCase[] = [
  {
    id: "zakat-savings",
    topic: "Zakat on saved money",
    questions: { en: "Do I have to pay zakat on my savings?", ur: "کیا جمع شدہ رقم پر زکوٰۃ واجب ہے؟", ar: "هل تجب الزكاة على المال المدخر؟" },
    relevantIf: { ar: ["الزكاة", "زكاة"], ur: ["زکوٰۃ", "زکات", "زکوة"] },
  },
  {
    id: "wudu-nullifiers",
    topic: "What breaks wudu",
    questions: { en: "What breaks wudu?", ur: "وضو کن چیزوں سے ٹوٹ جاتا ہے؟", ar: "ما الذي ينقض الوضوء؟" },
    relevantIf: { ar: ["الوضوء", "ينقض", "نواقض"], ur: ["وضو"] },
  },
  {
    id: "sajda-sahw",
    topic: "Prostration of forgetfulness",
    questions: { en: "I forgot the first tashahhud in prayer. Do I have to do sajda sahw?", ur: "میں نماز میں پہلا تشہد بھول گیا، کیا سجدہ سہو لازم ہے؟", ar: "نسيت التشهد الأول في الصلاة فهل يلزمني سجود السهو؟" },
    relevantIf: { ar: ["السهو", "التشهد"], ur: ["سہو", "تشہد"] },
  },
  {
    id: "fast-broken",
    topic: "What invalidates the fast",
    questions: { en: "Does eating by mistake break the fast?", ur: "کیا بھول کر کھانے سے روزہ ٹوٹ جاتا ہے؟", ar: "هل يفسد الصوم بالأكل ناسيا؟" },
    relevantIf: { ar: ["الصوم", "ناسيا", "أكل"], ur: ["روزہ"] },
  },
  {
    id: "nikah-wali",
    topic: "Guardian in marriage",
    questions: { en: "Is a guardian required for a valid marriage contract?", ur: "کیا نکاح کے صحیح ہونے کے لیے ولی ضروری ہے؟", ar: "هل يشترط الولي لصحة النكاح؟" },
    relevantIf: { ar: ["النكاح", "الولي", "ولي"], ur: ["نکاح", "ولی"] },
  },
];

function relevant(chunk: StoredChunk, test: EvalCase["relevantIf"]): boolean {
  const text = chunk.originalText;
  if (chunk.language === "ur") return test.ur.some((form) => text.includes(form)) || test.ar.some((form) => text.includes(form));
  return test.ar.some((form) => text.includes(form));
}

async function main() {
  loadProjectEnv();
  const { values } = parseArgs({
    options: { madhhab: { type: "string", default: "hanafi" }, book: { type: "string" }, out: { type: "string", default: ".data/eval" } },
    strict: true,
  });
  const madhhab = parseMadhhab(values.madhhab ?? "hanafi");
  const store = await openStore();
  const documents = await store.listDocuments();
  const allChunks = await store.listChunks();
  const approved = allChunks.filter((chunk) => chunkAllowed(chunk, madhhab, false) && (!values.book || chunk.title.toLowerCase().includes(values.book.toLowerCase())));
  const approvedDocuments = new Set(approved.map((chunk) => chunk.documentId));

  console.log(`Madhhab: ${madhhab}. Documents in store: ${documents.length}. Chunks in store: ${allChunks.length}.`);
  console.log(`Approved searchable chunks for ${madhhab}${values.book ? ` in "${values.book}"` : ""}: ${approved.length} across ${approvedDocuments.size} document(s).`);
  for (const id of MADHHABS) {
    const count = allChunks.filter((chunk) => chunkAllowed(chunk, id, false)).length;
    console.log(`  approved chunks, ${id}: ${count}`);
  }

  const results = CASES.map((item) => {
    const perLanguage = (["en", "ur", "ar"] as const).map((language) => {
      const question = item.questions[language];
      const processed = processQuestion(question);
      const ranked = selectChunks({ chunks: approved, madhhab, variants: processed.variants, allowTestFixtures: false, limit: 10 });
      const firstRelevant = ranked.findIndex((chunk) => relevant(chunk, item.relevantIf));
      return {
        language,
        question,
        detectedLanguage: processed.detectedLanguage,
        arabicQuery: processed.arabicQuery.text,
        urduQuery: processed.urduQuery.text,
        returned: ranked.length,
        firstRelevantRank: firstRelevant === -1 ? null : firstRelevant + 1,
        top5: firstRelevant !== -1 && firstRelevant < 5,
        top10: firstRelevant !== -1 && firstRelevant < 10,
        topResults: ranked.slice(0, 3).map((chunk) => ({ id: chunk.id, title: chunk.title, pdfPage: chunk.pdfPageStart, printedPage: chunk.printedPageStart, score: Number(chunk.retrievalScore.toFixed(3)) })),
      };
    });
    return { ...item, results: perLanguage };
  });

  const measurable = approved.length > 0;
  const summary = (["en", "ur", "ar"] as const).map((language) => {
    const rows = results.map((item) => item.results.find((row) => row.language === language)!);
    return {
      language,
      cases: rows.length,
      top5: rows.filter((row) => row.top5).length,
      top10: rows.filter((row) => row.top10).length,
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    madhhab,
    bookFilter: values.book ?? null,
    measurable,
    approvedChunks: approved.length,
    approvedDocuments: Array.from(approvedDocuments).map((id) => documents.find((document) => document.id === id)?.title ?? id),
    note: measurable
      ? "Relevance here means the passage contains the expected term(s). It is a retrieval recall check, not a judgement that the passage answers the question."
      : "No approved searchable chunk exists for this madhhab. Nothing was measured. Approve a calibrated book with ocr:index --approve before rerunning.",
    summary,
    cases: results,
  };

  const outDir = path.resolve(values.out ?? ".data/eval");
  await mkdir(outDir, { recursive: true });
  const file = path.join(outDir, `real-book-${madhhab}-${report.generatedAt.replace(/[:.]/g, "-")}.json`);
  await writeFile(file, JSON.stringify(report, null, 2), "utf8");

  if (!measurable) {
    console.log("\nResult: NOT MEASURABLE. The approved index for this madhhab is empty, so no real-book retrieval figure is reported.");
  } else {
    console.log("\nTop-5 / top-10 hit counts by question language:");
    for (const row of summary) console.log(`  ${row.language}: top5 ${row.top5}/${row.cases}, top10 ${row.top10}/${row.cases}`);
  }
  console.log(`Report: ${file}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
