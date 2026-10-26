import { PrismaClient } from "@prisma/client";
import { EXPECTED_WORKS, INSTITUTIONS, QUDURI_CATALOGUE_CANDIDATES, statusForWork } from "../src/data/sources";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. The seed did not run and did not write any rows.");
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  for (const institution of INSTITUTIONS) {
    await prisma.institution.upsert({
      where: { id: institution.id },
      update: { payload: institution },
      create: {
        id: institution.id,
        payload: institution,
        domains: { create: [{ hostname: institution.domain }] },
      },
    });
  }

  for (const work of EXPECTED_WORKS) {
    const madhhab = work.madhhab === "comparative" ? null : work.madhhab;
    await prisma.work.upsert({
      where: { id: work.id },
      update: {
        canonicalTitle: work.canonicalTitle,
        madhhab,
        workType: work.workType,
        comparative: work.madhhab === "comparative",
      },
      create: {
        id: work.id,
        canonicalTitle: work.canonicalTitle,
        alternativeTitles: [],
        madhhab,
        workType: work.workType,
        comparative: work.madhhab === "comparative",
      },
    });
    const status = statusForWork(work.id);
    await prisma.acquisitionRecord.upsert({
      where: { id: work.id },
      update: { status, payload: { notes: work.notes, canonicalTitle: work.canonicalTitle } },
      create: {
        id: work.id,
        workId: work.id,
        status,
        payload: { notes: work.notes, canonicalTitle: work.canonicalTitle },
        attempts: work.id === "quduri"
          ? {
            create: QUDURI_CATALOGUE_CANDIDATES.map((item) => ({
              query: "site:archive.org Mukhtasar al-Quduri",
              url: item.url,
              outcome: item.outcome,
              at: item.checked,
            })),
          }
          : undefined,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : "SEED_FAILED");
    await prisma.$disconnect();
    process.exit(1);
  });
