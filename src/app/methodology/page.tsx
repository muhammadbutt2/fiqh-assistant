import { retrievalSupport } from "@/data/retrieval-support";

export default function MethodologyPage() {
  return (
    <main className="wrap">
      <h1>Our Methodology</h1>
      <p>Online Mufti searches approved passages for the madhhab you selected. It does not issue a binding ruling, and it does not switch schools when the language changes.</p>
      <h2>How a question is searched</h2>
      <ol>
        <li>The original question is kept and searched as written.</li>
        <li>Its script and likely language are detected. Mixed text stays marked as mixed.</li>
        <li>Recognized fiqh terms are expanded into Arabic and Urdu search terms from the terminology list. That is not a translation of the whole sentence.</li>
        <li>If a translation provider is configured on the server, Arabic and Urdu translations are added as extra queries. None is configured in the default setup.</li>
        <li>Lexical search runs on the original text and the variants. Semantic embeddings are not configured, so there is no cross-language vector index.</li>
        <li>Only approved, searchable passages in the selected madhhab can be cited. Unmeasured OCR stays out.</li>
      </ol>
      <h2>Language support, as implemented</h2>
      <p>The interface lists 20 languages. A row below is not a claim that retrieval in that language has been measured on the real books.</p>
      <ul>
        {retrievalSupport().map((item) => (
          <li key={item.languageId}><strong>{item.languageId}</strong> — detection {item.detection}; query help {item.queryTranslation}; evaluation {item.evaluation}. {item.limitation}</li>
        ))}
      </ul>
      <p className="meta">Turkish is not in the language list. A Turkish question can still match a listed term such as zekât, but the answer language stays one of the configured locales.</p>
    </main>
  );
}
