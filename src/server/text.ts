/**
 * Facade kept for existing imports. Normalization lives in normalize.ts, detection in
 * detect.ts and three-language query processing in query.ts.
 */
export { normalizeForSearch, tokenize } from "@/server/normalize";
export { detectLanguage, hasNegation, isHighStakes, negationWords } from "@/server/detect";
export { buildVariants, processQuestion, processQuestionWithProvider } from "@/server/query";
