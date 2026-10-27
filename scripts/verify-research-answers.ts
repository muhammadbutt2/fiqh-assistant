import path from "path";
import { answerQuestion } from "../src/server/answer";
import { unavailableChat } from "../src/server/ai";
import { createMemoryStore, type Store } from "../src/server/store";

async function runCase(
  label: string,
  madhhab: "hanafi" | "shafii" | "maliki",
  question: string,
  chunks: Awaited<ReturnType<Store["listChunks"]>>,
  institutions: Awaited<ReturnType<Store["listInstitutions"]>>,
) {
  const answer = await answerQuestion({
    madhhab,
    answerLocale: "en",
    question,
    chunks,
    institutions,
    chat: unavailableChat(),
    searchWebsites: true,
  });
  const citations = answer.citations.map((item) => ({
    sourceId: item.sourceId,
    title: item.title,
    role: item.evidenceRole,
    url: item.url,
    excerpt: item.originalExcerpt.slice(0, 160),
  }));
  return {
    label,
    query: question,
    madhhab,
    status: answer.answerStatus,
    evidenceRole: answer.evidenceRole,
    directAnswer: answer.presentation?.directAnswer ?? answer.answer,
    coverage: answer.presentation?.coverageStatus,
    citationCount: citations.length,
    citations,
    booksSearched: answer.research?.booksSearched.filter((item) => item.approved || item.searchable).slice(0, 8),
    websitesSearched: answer.research?.websitesSearchedDetail,
    websitesSkipped: answer.research?.websitesSkipped.slice(0, 4),
    candidateMatches: answer.research?.candidateMatches,
    rejectedIrrelevant: answer.research?.rejectedIrrelevant,
    rejectedQuality: answer.research?.rejectedQuality,
    outcomeReason: answer.research?.outcomeReason,
    translationMethod: answer.translationMethod,
  };
}

async function main() {
  const store = createMemoryStore(path.resolve(".data/store.json"));
  const chunks = await store.listChunks();
  const institutions = await store.listInstitutions();
  const documents = await store.listDocuments();
  const enabled = institutions.filter((item) => item.retrievalAllowed);
  const summary = {
    documents: documents.map((item) => ({ title: item.title, madhhab: item.madhhab, searchable: item.searchable, trust: item.trustClassification, ocr: item.ocrStatus })),
    chunkCount: chunks.length,
    approvedChunks: chunks.filter((item) => item.searchable && item.trustClassification === "approved" && item.verificationStatus === "verified").length,
    enabledWebsites: enabled.map((item) => ({ id: item.id, domain: item.domain, trustedPool: item.trustedPool })),
  };
  const cases = [
    await runCase("hanafi-zakat", "hanafi", "Do I have to pay zakat on my savings?", chunks, institutions),
    await runCase("hanafi-wudu", "hanafi", "What invalidates wudu?", chunks, institutions),
    await runCase("shafii-wudu", "shafii", "Is wudu required before prayer?", chunks, institutions),
    await runCase("maliki-zakat", "maliki", "Do I have to pay zakat on my savings?", chunks, institutions),
  ];
  console.log(JSON.stringify({ summary, cases }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
