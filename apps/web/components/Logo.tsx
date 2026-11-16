/** The Afterlife mark: a candle burning on a floppy disk. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 40" className={className} aria-hidden="true" focusable="false">
      {/* flame */}
      <path
        d="M16 1c2.4 3 3.4 5.2 3.4 7a3.4 3.4 0 0 1-6.8 0c0-1.8 1-4 3.4-7z"
        fill="var(--color-candle)"
      />
      {/* candle */}
      <rect x="13" y="11" width="6" height="10" rx="1" fill="var(--color-bone)" />
      {/* floppy disk */}
      <path d="M3 21h23l3 3v15H3z" fill="var(--color-ectoplasm)" />
      <rect x="8" y="21" width="13" height="6" fill="var(--color-graveyard)" />
      <rect x="17" y="22" width="3" height="4" fill="var(--color-ectoplasm)" />
      <rect x="7" y="31" width="18" height="6" rx="1" fill="var(--color-bone)" />
    </svg>
  );
}
