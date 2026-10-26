-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Madhhab" AS ENUM ('hanafi', 'maliki', 'shafii', 'hanbali');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "role" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnonymousSession" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnonymousSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Preference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "madhhab" "Madhhab",
    "answerLocale" TEXT,

    CONSTRAINT "Preference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Author" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Author_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Work" (
    "id" TEXT NOT NULL,
    "canonicalTitle" TEXT NOT NULL,
    "alternativeTitles" TEXT[],
    "authorId" TEXT,
    "madhhab" "Madhhab",
    "workType" TEXT NOT NULL,
    "comparative" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Edition" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "publisher" TEXT,
    "year" TEXT,
    "isbn" TEXT,

    CONSTRAINT "Edition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "editionId" TEXT,
    "title" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "madhhab" "Madhhab" NOT NULL,
    "sourceClass" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "rightsStatus" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL,
    "trustClassification" TEXT NOT NULL,
    "ocrStatus" TEXT NOT NULL,
    "searchable" BOOLEAN NOT NULL DEFAULT false,
    "isTestFixture" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "verificationNote" TEXT NOT NULL DEFAULT '',
    "methodology" TEXT NOT NULL DEFAULT '',
    "checkedOn" TEXT NOT NULL DEFAULT '',
    "editionLabel" TEXT,
    "url" TEXT,
    "fatwaNumber" TEXT,
    "volume" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RightsRecord" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "checkedOn" TEXT NOT NULL,

    CONSTRAINT "RightsRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationRecord" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reviewerNote" TEXT NOT NULL,
    "methodology" TEXT,
    "checkedOn" TEXT NOT NULL,

    CONSTRAINT "VerificationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "madhhab" "Madhhab" NOT NULL,
    "sourceClass" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "originalText" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "chapterPath" JSONB NOT NULL,
    "volume" INTEGER,
    "printedPageStart" INTEGER,
    "printedPageEnd" INTEGER,
    "pdfPageStart" INTEGER NOT NULL,
    "pdfPageEnd" INTEGER NOT NULL,
    "ocrQuality" TEXT NOT NULL,
    "searchable" BOOLEAN NOT NULL,
    "trustClassification" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL,
    "rightsStatus" TEXT NOT NULL,
    "isTestFixture" BOOLEAN NOT NULL DEFAULT false,
    "url" TEXT,
    "fatwaNumber" TEXT,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "editionLabel" TEXT,
    "opinionLabels" JSONB NOT NULL,
    "comparativeAppliesTo" JSONB NOT NULL,
    "translation" JSONB,
    "embedding" JSONB,
    "workId" TEXT,
    "editionId" TEXT,

    CONSTRAINT "Chunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Institution" (
    "id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FatwaRecord" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT,
    "url" TEXT NOT NULL,
    "madhhab" "Madhhab",
    "methodologyStatus" TEXT NOT NULL,
    "stored" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "checkedOn" TEXT NOT NULL,

    CONSTRAINT "FatwaRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcquisitionRecord" (
    "id" TEXT NOT NULL,
    "workId" TEXT,
    "status" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "AcquisitionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcquisitionAttempt" (
    "id" TEXT NOT NULL,
    "acquisitionId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "url" TEXT,
    "outcome" TEXT NOT NULL,
    "at" TEXT NOT NULL,

    CONSTRAINT "AcquisitionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionJob" (
    "id" TEXT NOT NULL,
    "documentId" TEXT,
    "status" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionEvent" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "at" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "level" TEXT NOT NULL,

    CONSTRAINT "IngestionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "anonymousId" TEXT,
    "madhhab" "Madhhab" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT,
    "originalText" TEXT NOT NULL,
    "textSha256" TEXT NOT NULL,
    "detectedLanguage" TEXT NOT NULL,
    "detectionUncertain" BOOLEAN NOT NULL,
    "answerLocale" TEXT NOT NULL,
    "madhhab" "Madhhab" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetrievalVariant" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "textSha256" TEXT NOT NULL,
    "method" TEXT NOT NULL,

    CONSTRAINT "RetrievalVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Citation" (
    "id" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "valid" BOOLEAN NOT NULL,

    CONSTRAINT "Citation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "answerId" TEXT,
    "userId" TEXT,
    "kind" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "madhhab" TEXT,
    "detectedLanguage" TEXT,
    "answerLanguage" TEXT,
    "retrievalLanguages" TEXT,
    "sourceIds" TEXT,
    "latencyMs" INTEGER,
    "provider" TEXT,
    "model" TEXT,
    "translationMethod" TEXT,
    "citationValidation" TEXT,
    "answerStatus" TEXT,
    "errorCode" TEXT,
    "questionSha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlossaryTerm" (
    "id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "GlossaryTerm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Preference_userId_key" ON "Preference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_sha256_key" ON "Document"("sha256");

-- CreateIndex
CREATE INDEX "Document_madhhab_searchable_idx" ON "Document"("madhhab", "searchable");

-- CreateIndex
CREATE INDEX "Chunk_madhhab_searchable_idx" ON "Chunk"("madhhab", "searchable");

-- CreateIndex
CREATE UNIQUE INDEX "Domain_hostname_key" ON "Domain"("hostname");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Preference" ADD CONSTRAINT "Preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Work" ADD CONSTRAINT "Work_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Author"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Edition" ADD CONSTRAINT "Edition_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RightsRecord" ADD CONSTRAINT "RightsRecord_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationRecord" ADD CONSTRAINT "VerificationRecord_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chunk" ADD CONSTRAINT "Chunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FatwaRecord" ADD CONSTRAINT "FatwaRecord_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcquisitionRecord" ADD CONSTRAINT "AcquisitionRecord_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcquisitionAttempt" ADD CONSTRAINT "AcquisitionAttempt_acquisitionId_fkey" FOREIGN KEY ("acquisitionId") REFERENCES "AcquisitionRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionJob" ADD CONSTRAINT "IngestionJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionEvent" ADD CONSTRAINT "IngestionEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "IngestionJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetrievalVariant" ADD CONSTRAINT "RetrievalVariant_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
