import { EXPECTED_WORKS, INSTITUTIONS, LOCAL_BOOK_FILES, statusForWork } from "@/data/sources";

export default function SourcesPage() {
  return (
    <main className="wrap">
      <h1>Source registry</h1>
      <p>Nothing here is an approved corpus. Trusted pools are empty until a person records verification. Local files are not in this repository.</p>
      <h2>Institutions checked on 26 October 2026</h2>
      {INSTITUTIONS.map((item) => (
        <article className="panel" key={item.id} style={{ marginBottom: "1rem" }}>
          <h3>{item.officialName}</h3>
          <p><a href={item.homepage}>{item.homepage}</a></p>
          <p>{item.methodology}</p>
          <p className="meta">Methodology status: {item.methodologyStatus}. Retrieval allowed: no. Review: {item.reviewStatus}.</p>
          <p>{item.accessibility}</p>
        </article>
      ))}
      <h2>Expected books</h2>
      <ul>
        {EXPECTED_WORKS.map((work) => (
          <li key={work.id}><strong>{work.canonicalTitle}</strong> — {work.author} — {String(work.madhhab)} — {statusForWork(work.id)}. No verified edition is recorded.</li>
        ))}
      </ul>
      <h2>Local files left outside the repository</h2>
      <ul>
        {LOCAL_BOOK_FILES.map((file) => (
          <li key={file.fileName}>
            <div>{file.fileName} — {file.bytes} bytes — {file.sha256} — {file.status}</div>
            <p className="meta">{file.notes}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
