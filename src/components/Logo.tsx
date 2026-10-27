export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#123C35" />
      <path d="M14 46V28c0-10 8-18 18-18s18 8 18 18v18" fill="none" stroke="#C5A15B" strokeWidth="2.4" />
      <path d="M20 46V34h24v12" fill="#EEF4EF" />
      <path d="M22 46V36h20v10" fill="none" stroke="#174B40" strokeWidth="1.4" />
      <path d="M32 36v10M24 42h16" stroke="#C5A15B" strokeWidth="1.2" />
    </svg>
  );
}
