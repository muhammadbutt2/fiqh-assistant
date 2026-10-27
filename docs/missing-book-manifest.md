# Missing-book manifest

Checked on 26 October 2026. Local folder: `C:\Users\muham\OneDrive\Desktop\hanfi books`. Sixteen PDF files were present. None were copied into git. All are `rights_review_required`. No publisher, year, or ISBN was verified. PDF info-dictionary Title and Author fields are recorded below as file metadata. They were not collated against a printed edition, and they are not a rights clearance.

`npm run inventory:books` read page counts and the info dictionary only. Page text was not saved.

## Local files

SHA-256 is lowercase. `alhadayah4.pdf` and `alhadayah5.pdf` are the same bytes.

| File | Bytes | Pages | SHA-256 | PDF info Title | PDF info Author |
| --- | ---: | ---: | --- | --- | --- |
| al-qaduri.pdf | 6185384 | 255 | `02938024fff11e8f1323ad3ef0a1b4060b6bf66d5cd5498a79aef25a2a964cf1` | مختصر القدوري | احمد بن محمد بن محمد بن جعفر القدوري |
| al-hadaya1.pdf | 12376961 | 374 | `1a0a38e2e916ac1e53649eec5350a5b3970732869fb62b2360779cc1aeb3b169` | الهداية شرح بداية المبتدى - ج 8: الجنايات - الخنثى | علي بن أبي بكر المرغياني برهان الدين أبو الحسن |
| alhadayah-2.pdf | 15904058 | 459 | `97274549b413a431214c7abef9e029b91161fa9d6a705f1b56205b245e73c0c0` | الهداية شرح بداية المبتدى - ج 7: الشفعة - الرهن | same author string as the other Hidayah files |
| alhadayah3.pdf | 17712608 | 528 | `612d5370bf7654b367e1fbbf0d22525f60b716623a41f6dfdb14444e154de17b` | الهداية شرح بداية المبتدى - ج 6: الدعوى - الغصب | same author string |
| alhadayah4.pdf | 18419735 | 560 | `2088c0216514d052b72c9c647109ab1a7d2c9a74d6bebbd93ac3d0ad508f3860` | الهداية شرح بداية المبتدى - ج 5: البيوع - الوكالة | same author string |
| alhadayah5.pdf | 18419735 | 560 | `2088c0216514d052b72c9c647109ab1a7d2c9a74d6bebbd93ac3d0ad508f3860` | same as alhadayah4.pdf | same file as alhadayah4.pdf |
| alhadayah6.pdf | 13182512 | 452 | `fd643c96bfe71dd4e7c6f0b1454aad1316f7b7f207391b58e0761e0f39b6169f` | الهداية شرح بداية المبتدى - ج 4: الأيمان - الوقف | same author string |
| alhadayah7.pdf | 14899335 | 500 | `dddfcfdb5f29c3ce14fd9d14863f65453c26d10f6fcea24c3781edb4b14289b6` | الهداية شرح بداية المبتدى - ج 3: النكاح - العتاق | same author string |
| alhadayah8.pdf | 18702276 | 504 | `b677829505c213583ad12717dc84c2bc700c31fb62914d6e0153e77d4e4fac16` | الهداية شرح بداية المبتدى - ج 2: تابع الصلاة - الحج | same author string |
| alhadayah9.pdf | 13398298 | 396 | `4c8429966ab16e4b78e8772bc46abaf19aed71cc478e13aa47d0b71f2f17a4d4` | الهداية شرح بداية المبتدى - ج 1: الطهارة - الصلاة | same author string |
| fhindia2.pdf | 11117770 | 446 | `2099929eb18677bc7d91a6e15b4bd5df4c98a36a2188c68ac560bc39db4e8758` | الفتاوى الهندية - ج 2, with the chapter range stored in the info Title | empty |
| fhindia3.pdf | 15312051 | 600 | `bb896cf90f6d96601054cb0655160a33c8d3a9f81455e1463c81bb442ad0dc5c` | الفتاوى الهندية - ج 3 | empty |
| fhindia4.pdf | 16342548 | 616 | `532dba4b7524b9e06d660af03f159906aa795a34e0df2ed78cf17b816b67f616` | الفتاوى الهندية - ج 4 | empty |
| fhindia5.pdf | 14743749 | 576 | `cb22449e57e36efbadfb5c28c470e6d852f5e19ee1ff9ccb4aa4156c01d0e349` | الفتاوى الهندية - ج 5 | empty |
| fhindia6.pdf | 13763538 | 542 | `7165d8008a480a8497a9af4c8373d18da227a893f23e95f28e98b6462bd11ddd` | الفتاوى الهندية - ج 6 | empty |
| BahishtiZewarUrduCompletedeobandi--Www.momeen.blogspot.com.pdf | 60135901 | 768 | `c646c674df4df21ebafdff472fcab259e708097fa1abfd266f866cb8cca8e47d` | empty | empty |

The Hidayah filename digit does not match the volume number in the info Title. `al-hadaya1.pdf` says volume 8. `alhadayah9.pdf` says volume 1. There is no separate volume-1 file of al-Fatawa al-Hindiyyah in the folder. `fhindia2.pdf` through `fhindia6.pdf` say volumes 2 through 6. The Blogspot name in the Bahishti Zewar filename is not a licence.

Candidate works for those files: al-Quduri, al-Hidayah, al-Fatawa al-Hindiyyah, and Bahishti Zewar. Status in the app: `rights_review_required`. They are not searchable.

## Catalogue candidates not downloaded

Only these two detail pages were requested and returned HTTP 200. The files were not downloaded. Archive.org availability is not a rights clearance, and neither item was compared with `al-qaduri.pdf`.

- `https://archive.org/details/Mukhtasar-Al-Quduri`
- `https://archive.org/details/the-mukhtasar-al-quduri-imam-abul-husayn-ahmad-ibn-muh`

The search that produced them was `site:archive.org Mukhtasar al-Quduri`. Other classical titles were not given confirmed URLs in this pass. Unchecked search hits are not listed as located copies.

## Expected works with no local file

These remain `not_located`. No edition is recorded.

Hanafi: Radd al-Muhtar (Ibn Abidin), Bada'i al-Sana'i (al-Kasani), Al-Mabsut (al-Sarakhsi), Nur al-Idah (al-Shurunbulali).

Maliki: Al-Mudawwanah al-Kubra, Mukhtasar Khalil, Al-Risalah (Ibn Abi Zayd), Al-Kafi (Ibn Abd al-Barr), Mawahib al-Jalil (al-Hattab), Hashiyat al-Dusuqi.

Comparative only, not a school manual: Bidayat al-Mujtahid (Ibn Rushd).

Shafi'i: Al-Umm, Al-Majmu', Minhaj al-Talibin, Mughni al-Muhtaj, Tuhfat al-Muhtaj, Nihayat al-Muhtaj, Fath al-Mu'in.

Hanbali: Al-Mughni, Al-Insaf, Kashshaf al-Qina', Sharh Muntaha al-Iradat, Zad al-Mustaqni', Umdat al-Fiqh, Al-Rawd al-Murbi'.

No download was invented for any of them.

## Update 2026-10-27: local approval run

At the owner's instruction the 15 distinct local Hanafi PDFs were run through `scripts/ingest-local-books.ts`. None became searchable.

- 14 are image scans with no text layer (0 characters extracted). They are stored with ocrStatus `needs_ocr` and need an OCR engine plus a measured accuracy check.
- The Bahishti Zewar PDF has a text layer, but the text is garbled and not usable for retrieval.
- `alhadayah5.pdf` is byte-identical to another file and was skipped.

The only text indexed is the archive.org text of Minhaj al-Talibin (Shafi'i), added with `scripts/ingest-open-text.ts`. Its rights evidence is the uploader's Public Domain Mark. It is archive.org OCR of a 2005 edition, so accuracy is unmeasured and it contains editor material. The review note on the document says so.

No book text was written or generated. The titles listed above remain missing.
