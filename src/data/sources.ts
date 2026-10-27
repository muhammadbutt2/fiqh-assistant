import type { Madhhab } from "@/server/madhhab";

export type AcquisitionStatus =
  | "uploaded"
  | "found_not_downloaded"
  | "downloaded_unverified"
  | "bibliography_verified"
  | "rights_review_required"
  | "approved_for_ingestion"
  | "awaiting_human_upload"
  | "not_located"
  | "download_failed"
  | "ingestion_failed";

export type Institution = {
  id: string;
  officialName: string;
  domain: string;
  homepage: string;
  kind: "institution" | "portal" | "aggregator";
  methodology: string;
  methodologyStatus: "unverified" | "mixed" | "primary_with_exceptions" | "not_established";
  languages: string[];
  madhhabScope: Madhhab[];
  trustedPool: Madhhab[];
  accessMethod: string;
  licenseNotes: string;
  linkingAllowed: "unknown";
  retrievalAllowed: boolean;
  storingAllowed: "unknown" | "no";
  redistributionAllowed: "no" | "unknown";
  lastChecked: string;
  accessibility: string;
  reviewStatus: "identity_checked" | "pending" | "excluded";
  notes: string;
};

export const INSTITUTIONS: Institution[] = [
  {
    id: "jamia-darul-uloom-karachi",
    officialName: "Jamia Darul Uloom Karachi",
    domain: "darululoomkarachi.edu.pk",
    homepage: "https://darululoomkarachi.edu.pk/",
    kind: "institution",
    methodology: "The homepage fetched on 2026-10-26 identifies the seminary and a Darul Ifta, and describes Mufti Muhammad Shafi. That page did not contain an explicit madhhab label in the text searched for Hanafi/حنفي.",
    methodologyStatus: "unverified",
    languages: ["ur"],
    madhhabScope: [],
    trustedPool: [],
    accessMethod: "Public homepage only. No API was found or claimed.",
    licenseNotes: "Terms for storing or redistributing fatwas were not reviewed.",
    linkingAllowed: "unknown",
    retrievalAllowed: false,
    storingAllowed: "unknown",
    redistributionAllowed: "unknown",
    lastChecked: "2026-10-26",
    accessibility: "Homepage returned HTTP 200.",
    reviewStatus: "identity_checked",
    notes: "Candidate named in the project brief. Excluded from the trusted Hanafi pool until a person records the methodology.",
  },
  {
    id: "onlinedarulifta-karachi",
    officialName: "Darulifta Jamia Darululoom Karachi (placeholder site)",
    domain: "onlinedarulifta.com",
    homepage: "https://onlinedarulifta.com/",
    kind: "portal",
    methodology: "Not stated. The live page is a coming-soon / maintenance screen.",
    methodologyStatus: "not_established",
    languages: [],
    madhhabScope: [],
    trustedPool: [],
    accessMethod: "Homepage only.",
    licenseNotes: "No fatwa corpus was available to assess.",
    linkingAllowed: "unknown",
    retrievalAllowed: false,
    storingAllowed: "no",
    redistributionAllowed: "no",
    lastChecked: "2026-10-26",
    accessibility: "HTTP 200. HTML title: Darulifta Jamia Darululoom Karachi Official is coming soon. robots.txt returned HTTP 404.",
    reviewStatus: "excluded",
    notes: "Not merged with the seminary homepage. Not a usable fatwa archive on this date.",
  },
  {
    id: "darul-uloom-deoband",
    officialName: "Darul Uloom Deoband",
    domain: "darululoom-deoband.com",
    homepage: "https://darululoom-deoband.com/en/academic-departments-2/",
    kind: "institution",
    methodology: "The academic-departments page describes Darul Ifta but the fetched text did not state a madhhab by name. A separate Maslak page was not fetched.",
    methodologyStatus: "unverified",
    languages: ["en", "ur"],
    madhhabScope: [],
    trustedPool: [],
    accessMethod: "Institutional website. The page says selected fatwas are published at www.darulifta-deoband.com.",
    licenseNotes: "Bulk reuse was not permitted by any terms read in this pass.",
    linkingAllowed: "unknown",
    retrievalAllowed: false,
    storingAllowed: "unknown",
    redistributionAllowed: "unknown",
    lastChecked: "2026-10-26",
    accessibility: "Academic departments page returned HTTP 200.",
    reviewStatus: "identity_checked",
    notes: "This record is Darul Uloom Deoband, not Darul Uloom Waqf Deoband.",
  },
  {
    id: "darulifta-deoband-portal",
    officialName: "Darul Ifta, Darul Uloom Deoband (named portal)",
    domain: "darulifta-deoband.com",
    homepage: "https://darulifta-deoband.com/",
    kind: "portal",
    methodology: "Not read. The portal itself returned HTTP 403 from this machine, including /en and /robots.txt.",
    methodologyStatus: "unverified",
    languages: [],
    madhhabScope: [],
    trustedPool: [],
    accessMethod: "Named by darululoom-deoband.com as the online fatwa site. Direct fetch was blocked.",
    licenseNotes: "No terms page could be read.",
    linkingAllowed: "unknown",
    retrievalAllowed: false,
    storingAllowed: "no",
    redistributionAllowed: "no",
    lastChecked: "2026-10-26",
    accessibility: "HTTP 403 on 2026-10-26 for the English path and robots.txt.",
    reviewStatus: "pending",
    notes: "Domain identity rests on the seminary page, which links http://darulifta-deoband.com and lists www.darulifta-deoband.com. Content was not verified.",
  },
  {
    id: "darul-uloom-waqf-deoband",
    officialName: "Darul Ifta, Darul Uloom Waqf Deoband",
    domain: "darulifta.dud.edu.in",
    homepage: "https://darulifta.dud.edu.in/",
    kind: "portal",
    methodology: "The homepage meta description identifies Darul Uloom Waqf Deoband. It does not state a madhhab.",
    methodologyStatus: "unverified",
    languages: ["ur"],
    madhhabScope: [],
    trustedPool: [],
    accessMethod: "Public homepage.",
    licenseNotes: "Not reviewed. The visible fatwa list was empty.",
    linkingAllowed: "unknown",
    retrievalAllowed: false,
    storingAllowed: "no",
    redistributionAllowed: "no",
    lastChecked: "2026-10-26",
    accessibility: "HTTP 200. The page says No Categories Found. Footer: Darul Ifta-Darul Uloom Waqf Deoband, India.",
    reviewStatus: "excluded",
    notes: "Kept separate from Darul Uloom Deoband and from darulifta-deoband.com. Incomplete archive.",
  },
  {
    id: "jamia-binoria",
    officialName: "Jamia Binoria Aalamia, Darul Ifta",
    domain: "binoria.org",
    homepage: "https://binoria.org/daruliftaView",
    kind: "institution",
    methodology: "The fetched page says the fatwa-studies programme is a Hanafi and Shafi specialization, with dedicated Shafi'i experts. It is not a single-madhhab institution.",
    methodologyStatus: "mixed",
    languages: ["en", "ur"],
    madhhabScope: [],
    trustedPool: [],
    accessMethod: "One public page. robots.txt allows all user agents and disallows nothing. That is not permission to copy the corpus.",
    licenseNotes: "Storing and redistribution were not granted on the page that was read.",
    linkingAllowed: "unknown",
    retrievalAllowed: false,
    storingAllowed: "unknown",
    redistributionAllowed: "unknown",
    lastChecked: "2026-10-26",
    accessibility: "HTTP 200.",
    reviewStatus: "identity_checked",
    notes: "Excluded from every automatic madhhab pool. A fatwa would need its own madhhab label before use. onlinefatawa.com was not fetched in this pass and is not approved.",
  },
  {
    id: "mufti-wilayah-persekutuan",
    officialName: "Jabatan Mufti Wilayah Persekutuan",
    domain: "muftiwp.gov.my",
    homepage: "https://www.muftiwp.gov.my/",
    kind: "institution",
    methodology: "Its Bayan Linnas page quotes Administration of Islamic Law (Federal Territories) Act 505. Section 39(1) says the Mufti ordinarily follows the accepted view of the Shafi'i school. Section 39(2) allows the Hanafi, Maliki, or Hanbali accepted view for public interest. Section 39(3) allows an answer outside those accepted views in a further public-interest case.",
    methodologyStatus: "primary_with_exceptions",
    languages: ["ms", "en"],
    madhhabScope: ["shafii"],
    trustedPool: [],
    accessMethod: "Public website and the article https://www.muftiwp.gov.my/en/artikel/bayan-linnas/6003-bayan-linnas-siri-ke-301-fatwa-dari-perspektif-undang-undang-di-wilayah-persekutuan fetched on 2026-10-26. No official API was used. e-Fatwa was not bulk-downloaded.",
    licenseNotes: "Terms for storing gazetted fatwas were not reviewed. Retrieval stays off until a person approves a specific document and its madhhab.",
    linkingAllowed: "unknown",
    retrievalAllowed: false,
    storingAllowed: "unknown",
    redistributionAllowed: "unknown",
    lastChecked: "2026-10-26",
    accessibility: "Homepage and the cited article returned HTTP 200.",
    reviewStatus: "identity_checked",
    notes: "Shafi'i is the statutory starting point, not a guarantee that every fatwa is Shafi'i. Scope is the Federal Territories of Malaysia.",
  },
  {
    id: "alifta-saudi",
    officialName: "General Presidency of Scholarly Research and Ifta",
    domain: "alifta.gov.sa",
    homepage: "https://alifta.gov.sa/",
    kind: "institution",
    methodology: "The homepage was fetched. It was not established from that page, in this pass, that the institution issues fatwas exclusively within the Hanbali school.",
    methodologyStatus: "unverified",
    languages: ["ar"],
    madhhabScope: [],
    trustedPool: [],
    accessMethod: "Homepage only. robots.txt allows / and disallows /login-success and API paths. Those API paths were not called.",
    licenseNotes: "No bulk copy permission was found. The robots file is not a licence.",
    linkingAllowed: "unknown",
    retrievalAllowed: false,
    storingAllowed: "no",
    redistributionAllowed: "no",
    lastChecked: "2026-10-26",
    accessibility: "Homepage returned HTTP 200 and redirected to https://alifta.gov.sa/ar/home. robots.txt returned HTTP 200.",
    reviewStatus: "excluded",
    notes: "Official Saudi ifta site. Excluded from the Hanbali pool because a Hanbali-only method was not verified here. A secondary copy of Permanent Committee fatwa 4172 was not used as a methodology ruling.",
  },
  {
    id: "dar-alifta-egypt",
    officialName: "Dar al-Ifta al-Misriyyah",
    domain: "dar-alifta.org",
    homepage: "https://www.dar-alifta.org/",
    kind: "institution",
    methodology: "The Arabic about page was fetched. A search of that page for madhhab names (مذهب, شافعي, حنفي, مالكي) found no match. Methodology is unverified.",
    methodologyStatus: "unverified",
    languages: ["ar"],
    madhhabScope: [],
    trustedPool: [],
    accessMethod: "About page only: https://www.dar-alifta.org/ar/about",
    licenseNotes: "Not reviewed.",
    linkingAllowed: "unknown",
    retrievalAllowed: false,
    storingAllowed: "unknown",
    redistributionAllowed: "unknown",
    lastChecked: "2026-10-26",
    accessibility: "HTTP 200.",
    reviewStatus: "excluded",
    notes: "Not assigned to the Shafi'i pool.",
  },
  {
    id: "habous-morocco",
    officialName: "Ministry of Habous and Islamic Affairs",
    domain: "habous.gov.ma",
    homepage: "https://habous.gov.ma/",
    kind: "institution",
    methodology: "Not established from a live page in this pass.",
    methodologyStatus: "not_established",
    languages: ["ar", "fr"],
    madhhabScope: [],
    trustedPool: [],
    accessMethod: "Homepage fetch only.",
    licenseNotes: "Not reviewed.",
    linkingAllowed: "unknown",
    retrievalAllowed: false,
    storingAllowed: "no",
    redistributionAllowed: "no",
    lastChecked: "2026-10-26",
    accessibility: "Homepage returned HTTP 200 and said the portal is under maintenance. https://www.habous.gov.ma/fr/Islam-au-maroc.html returned HTTP 404. https://habous.gov.ma/fr/conseil-supérieur-des-oulémas/248-préposés-religieux returned HTTP 404. https://cso.ma/ did not connect.",
    reviewStatus: "pending",
    notes: "A web index still describes older Habous pages as mentioning the Maliki rite. Those pages were not live when requested, so the Maliki label is not verified here.",
  },
];

export type ExpectedWork = {
  id: string;
  canonicalTitle: string;
  author: string;
  madhhab: Madhhab | "comparative";
  workType: "primary" | "comparative" | "practical_guide" | "fatwa_collection";
  expectedLanguage: string;
  status: AcquisitionStatus;
  notes: string;
};

export const EXPECTED_WORKS: ExpectedWork[] = [
  ["quduri", "Mukhtasar al-Quduri", "Ahmad ibn Muhammad al-Quduri", "hanafi", "primary"],
  ["hidayah", "Al-Hidayah", "Burhan al-Din al-Marghinani", "hanafi", "primary"],
  ["hindiyyah", "Al-Fatawa al-Hindiyyah", "commission under Aurangzeb; compiled by a group of scholars", "hanafi", "fatwa_collection"],
  ["radd", "Radd al-Muhtar", "Ibn Abidin", "hanafi", "primary"],
  ["badayi", "Bada'i al-Sana'i", "al-Kasani", "hanafi", "primary"],
  ["mabsut", "Al-Mabsut", "al-Sarakhsi", "hanafi", "primary"],
  ["nur", "Nur al-Idah", "al-Shurunbulali", "hanafi", "primary"],
  ["bahishti", "Bahishti Zewar", "Ashraf Ali Thanwi", "hanafi", "practical_guide"],
  ["mudawwanah", "Al-Mudawwanah al-Kubra", "Sahnun, from Ibn al-Qasim's transmission of Malik", "maliki", "primary"],
  ["khalil", "Mukhtasar Khalil", "Khalil ibn Ishaq", "maliki", "primary"],
  ["risalah", "Al-Risalah", "Ibn Abi Zayd al-Qayrawani", "maliki", "primary"],
  ["kafi", "Al-Kafi fi Fiqh Ahl al-Madinah", "Ibn Abd al-Barr", "maliki", "primary"],
  ["mawahib", "Mawahib al-Jalil", "al-Hattab", "maliki", "primary"],
  ["dusuqi", "Hashiyat al-Dusuqi", "al-Dusuqi", "maliki", "primary"],
  ["bidayah", "Bidayat al-Mujtahid", "Ibn Rushd", "comparative", "comparative"],
  ["umm", "Al-Umm", "al-Shafi'i", "shafii", "primary"],
  ["majmu", "Al-Majmu'", "al-Nawawi", "shafii", "primary"],
  ["minhaj", "Minhaj al-Talibin", "al-Nawawi", "shafii", "primary"],
  ["mughni-muhtaj", "Mughni al-Muhtaj", "al-Khatib al-Shirbini", "shafii", "primary"],
  ["tuhfah", "Tuhfat al-Muhtaj", "Ibn Hajar al-Haytami", "shafii", "primary"],
  ["nihayah", "Nihayat al-Muhtaj", "al-Ramli", "shafii", "primary"],
  ["fath", "Fath al-Mu'in", "Zayn al-Din al-Malibari", "shafii", "primary"],
  ["mughni", "Al-Mughni", "Ibn Qudamah", "hanbali", "primary"],
  ["insaf", "Al-Insaf", "al-Mardawi", "hanbali", "primary"],
  ["kashshaf", "Kashshaf al-Qina'", "al-Buhuti", "hanbali", "primary"],
  ["muntaha", "Sharh Muntaha al-Iradat", "al-Buhuti", "hanbali", "primary"],
  ["zad", "Zad al-Mustaqni'", "al-Hajjawi", "hanbali", "primary"],
  ["umdah", "Umdat al-Fiqh", "Ibn Qudamah", "hanbali", "primary"],
  ["rawd", "Al-Rawd al-Murbi'", "al-Buhuti", "hanbali", "primary"],
].map(([id, canonicalTitle, author, madhhab, workType]) => ({
  id,
  canonicalTitle,
  author,
  madhhab: madhhab as ExpectedWork["madhhab"],
  workType: workType as ExpectedWork["workType"],
  expectedLanguage: id === "bahishti" ? "ur" : "ar",
  status: "not_located" as AcquisitionStatus,
  notes: "No edition, publisher, year, or ISBN is recorded because none was verified. Not approved for ingestion.",
}));

export type LocalBookFile = {
  fileName: string;
  bytes: number;
  sha256: string;
  candidateWorkId: string | null;
  status: AcquisitionStatus;
  notes: string;
};

export const LOCAL_BOOK_FILES: LocalBookFile[] = [
  { fileName: "al-qaduri.pdf", bytes: 6185384, sha256: "02938024fff11e8f1323ad3ef0a1b4060b6bf66d5cd5498a79aef25a2a964cf1", candidateWorkId: "quduri", status: "rights_review_required", notes: "255 pages. PDF info Title: مختصر القدوري. PDF info Author: احمد بن محمد بن محمد بن جعفر القدوري. Info-dictionary text is not an independently checked edition, publisher, or year. Not ingested." },
  { fileName: "al-hadaya1.pdf", bytes: 12376961, sha256: "1a0a38e2e916ac1e53649eec5350a5b3970732869fb62b2360779cc1aeb3b169", candidateWorkId: "hidayah", status: "rights_review_required", notes: "374 pages. The filename digit is 1. PDF info Title says volume 8 (الجنايات - الخنثى). Do not treat the filename digit as the volume. Not ingested." },
  { fileName: "alhadayah-2.pdf", bytes: 15904058, sha256: "97274549b413a431214c7abef9e029b91161fa9d6a705f1b56205b245e73c0c0", candidateWorkId: "hidayah", status: "rights_review_required", notes: "459 pages. Filename digit 2. PDF info Title says volume 7 (الشفعة - الرهن). Not ingested." },
  { fileName: "alhadayah3.pdf", bytes: 17712608, sha256: "612d5370bf7654b367e1fbbf0d22525f60b716623a41f6dfdb14444e154de17b", candidateWorkId: "hidayah", status: "rights_review_required", notes: "528 pages. Filename digit 3. PDF info Title says volume 6 (الدعوى - الغصب). Not ingested." },
  { fileName: "alhadayah4.pdf", bytes: 18419735, sha256: "2088c0216514d052b72c9c647109ab1a7d2c9a74d6bebbd93ac3d0ad508f3860", candidateWorkId: "hidayah", status: "rights_review_required", notes: "560 pages. Byte-identical to alhadayah5.pdf. PDF info Title says volume 5 (البيوع - الوكالة). Not two copies of different volumes. Not ingested." },
  { fileName: "alhadayah5.pdf", bytes: 18419735, sha256: "2088c0216514d052b72c9c647109ab1a7d2c9a74d6bebbd93ac3d0ad508f3860", candidateWorkId: "hidayah", status: "rights_review_required", notes: "Same SHA-256, page count, and PDF info Title as alhadayah4.pdf." },
  { fileName: "alhadayah6.pdf", bytes: 13182512, sha256: "fd643c96bfe71dd4e7c6f0b1454aad1316f7b7f207391b58e0761e0f39b6169f", candidateWorkId: "hidayah", status: "rights_review_required", notes: "452 pages. Filename digit 6. PDF info Title says volume 4 (الأيمان - الوقف). Not ingested." },
  { fileName: "alhadayah7.pdf", bytes: 14899335, sha256: "dddfcfdb5f29c3ce14fd9d14863f65453c26d10f6fcea24c3781edb4b14289b6", candidateWorkId: "hidayah", status: "rights_review_required", notes: "500 pages. Filename digit 7. PDF info Title says volume 3 (النكاح - العتاق). Not ingested." },
  { fileName: "alhadayah8.pdf", bytes: 18702276, sha256: "b677829505c213583ad12717dc84c2bc700c31fb62914d6e0153e77d4e4fac16", candidateWorkId: "hidayah", status: "rights_review_required", notes: "504 pages. Filename digit 8. PDF info Title says volume 2 (تابع الصلاة - الحج). Not ingested." },
  { fileName: "alhadayah9.pdf", bytes: 13398298, sha256: "4c8429966ab16e4b78e8772bc46abaf19aed71cc478e13aa47d0b71f2f17a4d4", candidateWorkId: "hidayah", status: "rights_review_required", notes: "396 pages. Filename digit 9. PDF info Title says volume 1 (الطهارة - الصلاة). Not ingested." },
  { fileName: "fhindia2.pdf", bytes: 11117770, sha256: "2099929eb18677bc7d91a6e15b4bd5df4c98a36a2188c68ac560bc39db4e8758", candidateWorkId: "hindiyyah", status: "rights_review_required", notes: "446 pages. PDF info Title says volume 2 and has no Author. A volume-1 file was not in the folder. Not ingested." },
  { fileName: "fhindia3.pdf", bytes: 15312051, sha256: "bb896cf90f6d96601054cb0655160a33c8d3a9f81455e1463c81bb442ad0dc5c", candidateWorkId: "hindiyyah", status: "rights_review_required", notes: "600 pages. PDF info Title says volume 3. Author field empty. Not ingested." },
  { fileName: "fhindia4.pdf", bytes: 16342548, sha256: "532dba4b7524b9e06d660af03f159906aa795a34e0df2ed78cf17b816b67f616", candidateWorkId: "hindiyyah", status: "rights_review_required", notes: "616 pages. PDF info Title says volume 4. Author field empty. Not ingested." },
  { fileName: "fhindia5.pdf", bytes: 14743749, sha256: "cb22449e57e36efbadfb5c28c470e6d852f5e19ee1ff9ccb4aa4156c01d0e349", candidateWorkId: "hindiyyah", status: "rights_review_required", notes: "576 pages. PDF info Title says volume 5. Author field empty. Not ingested." },
  { fileName: "fhindia6.pdf", bytes: 13763538, sha256: "7165d8008a480a8497a9af4c8373d18da227a893f23e95f28e98b6462bd11ddd", candidateWorkId: "hindiyyah", status: "rights_review_required", notes: "542 pages. PDF info Title says volume 6. Author field empty. Not ingested." },
  { fileName: "BahishtiZewarUrduCompletedeobandi--Www.momeen.blogspot.com.pdf", bytes: 60135901, sha256: "c646c674df4df21ebafdff472fcab259e708097fa1abfd266f866cb8cca8e47d", candidateWorkId: "bahishti", status: "rights_review_required", notes: "768 pages. PDF info Title and Author were empty. The filename names Bahishti Zewar and a Blogspot host. A blog name is not a licence. Not ingested." },
  { fileName: "BahishtiZewar.pdf", bytes: 47402421, sha256: "61d2ba3caaebc15957b3c018155e683bdca49a2393eebbeff3105b1d29eebaa9", candidateWorkId: "bahishti", status: "rights_review_required", notes: "890 pages, image scan, PDF info Title and Author empty. English translation, not the Urdu source: OCR of the title and imprint pages reads 'Heavenly Ornaments (Bahishti Zewar)', translated by Muhammad Mahomedy, Zam Zam Publishers, Karachi, second edition February 2005, ISBN 969-8863-15-X. Those details come from OCR of the printed pages and are not independently checked. The translation has its own copyright. Printed page = PDF page - 9 on the pages sampled. Not ingested." },
];

export function statusForWork(workId: string): AcquisitionStatus {
  if (LOCAL_BOOK_FILES.some((file) => file.candidateWorkId === workId)) return "rights_review_required";
  return "not_located";
}

export const QUDURI_CATALOGUE_CANDIDATES = [
  {
    url: "https://archive.org/details/Mukhtasar-Al-Quduri",
    checked: "2026-10-26",
    httpStatus: 200,
    outcome: "found_not_downloaded" as const,
    notes: "Detail page responded. The file was not downloaded. Archive.org availability is not a rights clearance, and the edition was not compared with a local file.",
  },
  {
    url: "https://archive.org/details/the-mukhtasar-al-quduri-imam-abul-husayn-ahmad-ibn-muh",
    checked: "2026-10-26",
    httpStatus: 200,
    outcome: "found_not_downloaded" as const,
    notes: "Detail page responded. Not downloaded and not bibliographically collated.",
  },
];
