/** Pelota de pádel (amarilla con su costura) para el botón del sorteo. */
export function PelotaPadel({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <radialGradient id="pelota-g" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#f6ffa8" />
          <stop offset="55%" stopColor="#d9f339" />
          <stop offset="100%" stopColor="#9fbf12" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="47" fill="url(#pelota-g)" />
      <path d="M14 22 C 42 34, 42 66, 14 78" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.95" />
      <path d="M86 22 C 58 34, 58 66, 86 78" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.95" />
      <circle cx="50" cy="50" r="47" fill="none" stroke="#000" strokeOpacity="0.08" strokeWidth="2" />
    </svg>
  );
}

