export default function PrivacyPage() {
  return (
    <main className="wrap">
      <h1>Privacy Policy</h1>
      <p>Questions are stored so an answer can be shown again and so language changes can reuse the same retrieved passages. Audit records store a hash of the question, not the question text.</p>
      <p>If you create an account, the password is stored as a scrypt hash. The session cookie is HttpOnly.</p>
      <p>A translation or answer model runs only when the server is configured with a provider. No provider is required for the terminology search. Do not put secrets in a question.</p>
      <p>This page describes the current local application. It is not a legal opinion.</p>
    </main>
  );
}
