import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { EXPECTED_WORKS, INSTITUTIONS, LOCAL_BOOK_FILES, QUDURI_CATALOGUE_CANDIDATES, mergeInstitution, statusForWork } from "@/data/sources";
// statusForWork is the operative acquisition status. The static work list stays descriptive.
import type { Madhhab } from "@/server/madhhab";
import type { PublicAnswer, StoredChunk } from "@/server/types";

export type StoredDocument = {
  id: string;
  title: string;
  author: string;
  madhhab: Madhhab;
  sourceClass: StoredChunk["sourceClass"];
  language: string;
  sha256: string;
  format: string;
  storagePath: string;
  rightsStatus: StoredChunk["rightsStatus"];
  verificationStatus: StoredChunk["verificationStatus"];
  trustClassification: StoredChunk["trustClassification"];
  ocrStatus: string;
  searchable: boolean;
  isTestFixture: boolean;
  notes: string;
  url: string | null;
  fatwaNumber: string | null;
  volume: number | null;
  editionLabel: string | null;
  workId: string | null;
  verificationNote: string;
  methodology: string;
  checkedOn: string;
};

export type JobRecord = {
  id: string;
  documentId: string | null;
  status: "queued" | "running" | "completed" | "failed";
  step: string;
  error: string | null;
  attempts: number;
  events: { at: string; message: string; level: string }[];
};

export type ExchangeRecord = {
  id: string;
  userId: string | null;
  question: string;
  questionSha256: string;
  madhhab: Madhhab;
  answerLocale: string;
  chunkIds: string[];
  answer: PublicAnswer;
  createdAt: string;
};

export type UserRecord = { id: string; email: string; passwordHash: string; createdAt: string };
export type PreferenceRecord = { userId: string; madhhab: Madhhab | null; answerLocale: string | null };
export type FeedbackRecord = { id: string; answerId: string | null; userId: string | null; kind: string; note: string; createdAt: string };
export type AuditRecord = {
  id: string;
  requestId: string;
  madhhab: string;
  detectedLanguage: string;
  answerLanguage: string;
  retrievalLanguages: string;
  sourceIds: string;
  latencyMs: number;
  provider: string;
  model: string | null;
  translationMethod: string;
  citationValidation: string;
  answerStatus: string;
  errorCode: string | null;
  questionSha256: string;
  createdAt: string;
};
export type AcquisitionRecord = {
  id: string;
  workId: string;
  status: string;
  notes: string;
  attempts: { query: string; url: string | null; outcome: string; at: string }[];
};

type Snapshot = {
  documents: StoredDocument[];
  chunks: StoredChunk[];
  jobs: JobRecord[];
  exchanges: ExchangeRecord[];
  users: UserRecord[];
  preferences: PreferenceRecord[];
  feedback: FeedbackRecord[];
  audits: AuditRecord[];
  institutions: typeof INSTITUTIONS;
  acquisitions: AcquisitionRecord[];
};

export type Store = {
  listChunks: () => Promise<StoredChunk[]>;
  saveDocument: (document: StoredDocument, chunks: StoredChunk[]) => Promise<void>;
  listDocuments: () => Promise<StoredDocument[]>;
  updateDocument: (id: string, patch: Partial<StoredDocument>) => Promise<StoredDocument>;
  getDocumentByHash: (sha256: string) => Promise<StoredDocument | null>;
  createJob: (job: JobRecord) => Promise<void>;
  updateJob: (id: string, patch: Partial<JobRecord>) => Promise<JobRecord>;
  listJobs: () => Promise<JobRecord[]>;
  saveExchange: (row: ExchangeRecord) => Promise<void>;
  getExchange: (id: string) => Promise<ExchangeRecord | null>;
  createUser: (user: UserRecord) => Promise<void>;
  findUserByEmail: (email: string) => Promise<UserRecord | null>;
  deleteUser: (id: string) => Promise<void>;
  upsertPreference: (preference: PreferenceRecord) => Promise<void>;
  getPreference: (userId: string) => Promise<PreferenceRecord | null>;
  addFeedback: (row: FeedbackRecord) => Promise<void>;
  writeAudit: (row: AuditRecord) => Promise<void>;
  listAudits: () => Promise<AuditRecord[]>;
  listInstitutions: () => Promise<typeof INSTITUTIONS>;
  updateInstitution: (id: string, patch: Partial<(typeof INSTITUTIONS)[number]>) => Promise<(typeof INSTITUTIONS)[number]>;
  listAcquisitions: () => Promise<AcquisitionRecord[]>;
  stats: () => Promise<Record<string, unknown>>;
};

function emptySnapshot(): Snapshot {
  return {
    documents: [],
    chunks: [],
    jobs: [],
    exchanges: [],
    users: [],
    preferences: [],
    feedback: [],
    audits: [],
    institutions: INSTITUTIONS.map((item) => ({ ...item, madhhabScope: [...item.madhhabScope], trustedPool: [...item.trustedPool], languages: [...item.languages] })),
    acquisitions: EXPECTED_WORKS.map((work) => ({
      id: work.id,
      workId: work.id,
      status: statusForWork(work.id),
      notes: work.notes,
      attempts: work.id === "quduri"
        ? QUDURI_CATALOGUE_CANDIDATES.map((item) => ({
          query: "site:archive.org Mukhtasar al-Quduri",
          url: item.url,
          outcome: item.outcome,
          at: item.checked,
        }))
        : [],
    })),
  };
}

export function createMemoryStore(persistPath?: string): Store {
  const state = persistPath && exists(persistPath) ? (JSON.parse(readFileSync(persistPath, "utf8")) as Snapshot) : emptySnapshot();
  const save = () => {
    if (!persistPath) return;
    mkdirSync(path.dirname(persistPath), { recursive: true });
    writeFileSync(persistPath, JSON.stringify(state));
  };
  return {
    async listChunks() { return state.chunks; },
    async saveDocument(document, chunks) {
      state.documents = state.documents.filter((item) => item.id !== document.id);
      state.chunks = state.chunks.filter((item) => item.documentId !== document.id);
      state.documents.push(document);
      state.chunks.push(...chunks);
      save();
    },
    async listDocuments() { return state.documents; },
    async updateDocument(id, patch) {
      const current = state.documents.find((item) => item.id === id);
      if (!current) throw new Error("NOT_FOUND");
      Object.assign(current, patch);
      state.chunks.filter((chunk) => chunk.documentId === id).forEach((chunk) => {
        chunk.searchable = current.searchable;
        chunk.trustClassification = current.trustClassification;
        chunk.verificationStatus = current.verificationStatus;
        chunk.rightsStatus = current.rightsStatus;
        chunk.madhhab = current.madhhab;
      });
      save();
      return current;
    },
    async getDocumentByHash(sha256) { return state.documents.find((item) => item.sha256 === sha256) ?? null; },
    async createJob(job) {
      state.jobs.push(job);
      save();
    },
    async updateJob(id, patch) {
      const job = state.jobs.find((item) => item.id === id);
      if (!job) throw new Error("NOT_FOUND");
      Object.assign(job, patch);
      save();
      return job;
    },
    async listJobs() { return state.jobs; },
    async saveExchange(row) {
      state.exchanges.push(row);
      save();
    },
    async getExchange(id) { return state.exchanges.find((item) => item.id === id) ?? null; },
    async createUser(user) {
      if (state.users.some((item) => item.email === user.email)) throw new Error("EMAIL_IN_USE");
      state.users.push(user);
      save();
    },
    async findUserByEmail(email) { return state.users.find((item) => item.email === email) ?? null; },
    async deleteUser(id) {
      state.users = state.users.filter((item) => item.id !== id);
      state.preferences = state.preferences.filter((item) => item.userId !== id);
      state.exchanges = state.exchanges.filter((item) => item.userId !== id);
      state.feedback = state.feedback.filter((item) => item.userId !== id);
      save();
    },
    async upsertPreference(preference) {
      state.preferences = state.preferences.filter((item) => item.userId !== preference.userId);
      state.preferences.push(preference);
      save();
    },
    async getPreference(userId) { return state.preferences.find((item) => item.userId === userId) ?? null; },
    async addFeedback(row) {
      state.feedback.push(row);
      save();
    },
    async writeAudit(row) {
      state.audits.push(row);
      save();
    },
    async listAudits() { return state.audits; },
    async listInstitutions() {
      return INSTITUTIONS.map((seed) => mergeInstitution(seed, state.institutions.find((item) => item.id === seed.id)));
    },
    async updateInstitution(id, patch) {
      let current = state.institutions.find((item) => item.id === id);
      const seed = INSTITUTIONS.find((item) => item.id === id);
      if (!current) {
        if (!seed) throw new Error("NOT_FOUND");
        current = { ...seed };
        state.institutions.push(current);
      }
      Object.assign(current, patch);
      save();
      return mergeInstitution(seed ?? current, current);
    },
    async listAcquisitions() { return state.acquisitions.map((item) => ({
      ...item,
      notes: LOCAL_BOOK_FILES.some((file) => file.candidateWorkId === item.workId)
        ? `${item.notes} Local candidate files exist and are quarantined.`
        : item.notes,
    }));
    },
    async stats() {
      const documents = state.documents.filter((item) => !item.isTestFixture);
      const chunks = state.chunks.filter((item) => !item.isTestFixture);
      const byMadhhab = Object.fromEntries(["hanafi", "maliki", "shafii", "hanbali"].map((madhhab) => [
        madhhab,
        documents.filter((item) => item.madhhab === madhhab).length,
      ]));
      const byLanguage: Record<string, number> = {};
      for (const document of documents) byLanguage[document.language] = (byLanguage[document.language] ?? 0) + 1;
      return {
        approvedBooks: documents.filter((item) => item.searchable && item.sourceClass === "primary").length,
        uploadedDocuments: documents.length,
        awaitingProcessing: state.jobs.filter((job) => job.status === "queued" || job.status === "running").length,
        indexedChunks: chunks.filter((item) => item.searchable).length,
        sourcesByMadhhab: byMadhhab,
        sourcesByLanguage: byLanguage,
        awaitingRightsReview: documents.filter((item) => item.rightsStatus === "rights_review_required").length,
        awaitingMetadataVerification: documents.filter((item) => item.verificationStatus !== "verified").length,
        failedJobs: state.jobs.filter((job) => job.status === "failed").length,
        missingRequiredBooks: state.acquisitions.filter((item) => item.status !== "approved_for_ingestion").length,
        sourcesDueForReverification: 0,
        recentAcquisition: state.acquisitions.flatMap((item) => item.attempts).slice(-8),
        libraryPopulated: chunks.some((item) => item.searchable),
      };
    },
  };
}

function exists(file: string): boolean {
  try {
    readFileSync(file);
    return true;
  } catch {
    return false;
  }
}

