import { EXPECTED_WORKS, INSTITUTIONS, LOCAL_BOOK_FILES, statusForWork } from "@/data/sources";
import { json } from "@/server/handlers";

export function GET() {
  return json({
    institutions: INSTITUTIONS,
    works: EXPECTED_WORKS.map((work) => ({ ...work, status: statusForWork(work.id) })),
    localFiles: LOCAL_BOOK_FILES.map(({ fileName, bytes, sha256, candidateWorkId, status }) => ({ fileName, bytes, sha256, candidateWorkId, status })),
  });
}
