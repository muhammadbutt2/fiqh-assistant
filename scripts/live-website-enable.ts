/**
 * Enable one website in the local store after a live retrieval test.
 * Does not change seed retrievalAllowed values. Usage:
 *   npx tsx scripts/live-website-enable.ts --confirm
 */
import path from "path";
import { INSTITUTIONS, normalizeInstitution } from "../src/data/sources";
import { unavailableChat } from "../src/server/ai";
import { answerQuestion } from "../src/server/answer";
import { loadProjectEnv } from "../src/server/ocr/runtime";
import { createMemoryStore } from "../src/server/store";
import { retrievalTestRecord, trialSearchInstitution } from "../src/server/websites";

const CONFIRM = process.argv.includes("--confirm");
const QUESTION = "Is wudu required before prayer?";
const ID = "mufti-wilayah-persekutuan";

async function main() {
  loadProjectEnv();
  const seed = INSTITUTIONS.find((item) => item.id === ID);
  if (!seed) throw new Error("seed missing");
  const trial = normalizeInstitution({ ...seed, retrievalAllowed: true, trustedPool: ["shafii"] });
  const report = await trialSearchInstitution({ institution: trial, madhhab: "shafii", question: QUESTION, limit: 2 });
  const test = retrievalTestRecord(report, trial.retrievalMethod ?? "none");
  const pages = report.hits.filter((hit) => !hit.snippetOnly);
  console.log(JSON.stringify({
    live: true,
    queries: report.queries,
    searched: report.searched,
    pages: pages.map((hit) => ({ url: hit.url, title: hit.title, excerpt: hit.excerpt.slice(0, 180), retrievedAt: hit.retrievedAt })),
    skipped: report.skipped.slice(0, 8),
    lastRetrievalTest: test,
  }, null, 2));
  if (!test.ok) {
    console.error("LIVE_TEST_FAILED");
    process.exit(1);
  }
  if (!CONFIRM) {
    console.log("Pass --confirm to write retrievalAllowed true for this institution only in the local store.");
    return;
  }
  const store = createMemoryStore(path.resolve(".data/store.json"));
  const current = (await store.listInstitutions()).find((item) => item.id === ID);
  if (!current) throw new Error("store row missing");
  const updated = await store.updateInstitution(ID, {
    trustedPool: ["shafii"],
    retrievalAllowed: true,
    lastRetrievalTest: test,
    lastChecked: "2026-10-27",
    notes: `${current.notes} Live OpenSearch test on 2026-10-27 from this machine retrieved a full article body. Query-time link only. Seed remains disabled.`,
  });
  const othersEnabled = (await store.listInstitutions()).filter((item) => item.retrievalAllowed && item.id !== ID);
  const shafii = await answerQuestion({
    madhhab: "shafii",
    answerLocale: "en",
    question: QUESTION,
    chunks: await store.listChunks(),
    institutions: await store.listInstitutions(),
    chat: unavailableChat(),
    libraryEmpty: !(await store.stats()).libraryPopulated,
  });
  const hanafi = await answerQuestion({
    madhhab: "hanafi",
    answerLocale: "en",
    question: QUESTION,
    chunks: await store.listChunks(),
    institutions: await store.listInstitutions(),
    chat: unavailableChat(),
    libraryEmpty: !(await store.stats()).libraryPopulated,
  });
  const stats = await store.stats();
  console.log(JSON.stringify({
    enabled: {
      id: updated.id,
      retrievalAllowed: updated.retrievalAllowed,
      trustedPool: updated.trustedPool,
      lastRetrievalTest: updated.lastRetrievalTest,
    },
    othersEnabled: othersEnabled.map((item) => item.id),
    approvedChunks: stats.indexedChunks,
    libraryPopulated: stats.libraryPopulated,
    shafii: {
      evidenceRole: shafii.evidenceRole,
      answerStatus: shafii.answerStatus,
      citations: shafii.citations.map((item) => ({ title: item.title, url: item.url, excerpt: item.originalExcerpt.slice(0, 160), sourceType: item.sourceType })),
    },
    hanafi: {
      evidenceRole: hanafi.evidenceRole,
      answerStatus: hanafi.answerStatus,
      citationCount: hanafi.citations.length,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
