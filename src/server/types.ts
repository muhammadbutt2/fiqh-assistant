import type { Madhhab } from "@/server/madhhab";

export type SourceClass = "primary" | "institutional_fatwa" | "secondary" | "comparative" | "unverified";
export type RightsStatus = "approved_for_ingestion" | "rights_review_required" | "unknown" | "rejected";
export type VerificationStatus = "verified" | "pending" | "unverified" | "rejected";
export type TrustClassification = "approved" | "pending" | "untrusted";
export type OcrQuality = "not_needed" | "unmeasured" | "acceptable" | "poor" | "uncertain";

export type OpinionLabel = { madhhab: Madhhab; label: string };

export type ChunkProvenance = {
  bookId: string;
  sourceSha256: string;
  configHash: string;
  extraction: "embedded_text" | "ocr";
  pageState: string;
  ocrEngine: string | null;
  ocrEngineVersion: string | null;
  ocrModel: string | null;
  ocrTraineddata: Record<string, string> | null;
  ocrMeanConfidence: number | null;
  accuracy: {
    status: "not_applicable" | "passed";
    reliableSamples: number | null;
    strictCer: number | null;
    strictWer: number | null;
    thresholdsLoosened: boolean;
  };
  printedPageSource: "none" | "verified_page_map";
};

export type ChunkTranslation = {
  language: string;
  text: string;
  status: "supplied_metadata";
  obscuresCondition?: boolean;
};

export type StoredChunk = {
  id: string;
  documentId: string;
  workId: string | null;
  editionId: string | null;
  madhhab: Madhhab;
  comparativeAppliesTo: Madhhab[];
  opinionLabels: OpinionLabel[];
  sourceClass: SourceClass;
  language: string;
  volume: number | null;
  printedPageStart: number | null;
  printedPageEnd: number | null;
  pdfPageStart: number;
  pdfPageEnd: number;
  chapterPath: string[];
  originalText: string;
  normalizedText: string;
  translation: ChunkTranslation | null;
  ocrQuality: OcrQuality;
  rightsStatus: RightsStatus;
  verificationStatus: VerificationStatus;
  trustClassification: TrustClassification;
  searchable: boolean;
  url: string | null;
  fatwaNumber: string | null;
  title: string;
  author: string;
  editionLabel: string | null;
  isTestFixture: boolean;
  embedding: number[] | null;
  provenance?: ChunkProvenance;
};

export type QueryVariant = {
  id: string;
  kind: "original" | "normalized" | "glossary" | "translation";
  language: string;
  text: string;
  method: string;
  model: string | null;
};

export type Detection = {
  language: string;
  script: string;
  mixed: boolean;
  uncertain: boolean;
  candidates: string[];
  romanUrdu: boolean;
  signals: string[];
};

export type PublicCitation = {
  sourceId: string;
  sourceType: SourceClass;
  title: string;
  author: string;
  edition: string | null;
  language: string;
  volume: number | null;
  printedPages: { start: number; end: number } | null;
  pdfPages: { start: number; end: number };
  chapter: string[];
  originalExcerpt: string;
  translatedExcerpt: string | null;
  translationStatus: "none" | "supplied_metadata" | "unreviewed_draft";
  url: string | null;
  fatwaNumber: string | null;
  verificationStatus: VerificationStatus;
  opinionLabels: OpinionLabel[];
  testFixture: boolean;
  provenance?: {
    extraction: ChunkProvenance["extraction"];
    ocrAccuracy: ChunkProvenance["accuracy"]["status"];
    ocrModel: string | null;
    sourceSha256: string;
  };
};

export type AnswerStatus = "answered" | "insufficient_evidence" | "needs_clarification" | "human_review_required";

export type PublicAnswer = {
  questionOriginal: string;
  detectedQueryLanguage: string;
  detectionUncertain: boolean;
  preferredAnswerLanguage: string;
  madhhab: Madhhab;
  answerStatus: AnswerStatus;
  answer: string;
  evidenceSummary: string;
  citations: PublicCitation[];
  uncertainties: string[];
  humanReviewRecommended: boolean;
  limitations: string[];
  answerGenerationVersion: string;
  promptVersion: string;
  notAMufti: true;
  nativeReview: "author" | "pending";
  canonicalEnglish: string | null;
  translationMethod: string;
  translationModel: string | null;
  translationFallback: boolean;
  semanticRetrieval: "unavailable" | "used" | "failed";
  retrievalLanguages: string[];
  sourceIds: string[];
  variantIds: string[];
  highStakes: boolean;
  unresolvedDisagreement: boolean;
  candidates?: string[];
  /** How the question was turned into Arabic and Urdu search queries. Search aids, not rulings. */
  querySummary?: QuerySummary;
};

export type QuerySummary = {
  detectedLanguage: string;
  detectionConfidence: "high" | "medium" | "low";
  arabicQuery: { text: string | null; method: "source_language" | "terminology" | "provider" | "none" };
  urduQuery: { text: string | null; method: "source_language" | "terminology" | "provider" | "none" };
  concepts: string[];
  negations: string[];
  conditions: string[];
  numbers: string[];
  ambiguities: string[];
  warnings: string[];
};
