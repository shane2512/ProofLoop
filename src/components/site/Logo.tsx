/** ProofLoop mark: an open loop whose end becomes a square marker (the recorded verdict). */
export function LogoMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M19.4 8.2A8.2 8.2 0 1 0 20.2 12" stroke="currentColor" strokeWidth="3.2" strokeLinecap="square" />
      <rect x="16.6" y="3.4" width="5.4" height="5.4" fill="currentColor" />
      <rect x="10.2" y="10.2" width="3.6" height="3.6" fill="currentColor" />
    </svg>
  );
}
