"use client";

const TOPICS: [string, string][] = [
  ["Taharah and Purification", "What breaks wudu?"],
  ["Salah and Prayer", "What is the ruling on the ritual prayer (salah)?"],
  ["Fasting and Ramadan", "What breaks the fast (sawm)?"],
  ["Zakat and Charity", "Do I have to pay zakat on my savings?"],
  ["Hajj and Umrah", "What is the ruling of Hajj?"],
  ["Nikah and Family", "What is a nikah?"],
  ["Business and Finance", "What is riba?"],
  ["Halal and Haram", "What does haram mean in fiqh?"],
  ["Inheritance", "Where do I start with inheritance (mirath)?"],
  ["Oaths and Vows", "What is an oath (yamin) in fiqh?"],
  ["Food and Daily Life", "What makes food halal or haram?"],
  ["Contemporary Questions", "How should I ask a contemporary masla?"],
];

export function TopicGrid() {
  function open(sample: string) {
    window.sessionStorage.setItem("fiqh.draft", sample);
    window.location.href = "/ask";
  }

  return (
    <div>
      <p className="meta">Sample questions, not rulings. Each card only fills the question box.</p>
      <div className="topic-grid">
        {TOPICS.map(([label, sample]) => (
          <button key={label} type="button" className="topic" onClick={() => open(sample)}>
            <span aria-hidden="true" className="topic-mark" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
