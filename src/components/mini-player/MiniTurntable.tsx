import { useId } from 'react';

// One coordinate system keeps the turntable aligned in browser and desktop windows.
export function MiniTurntable({ playing, artwork, accent, foreground, recordRef, className }: {
  playing: boolean; artwork?: string; accent: string; foreground: string; recordRef: (element: SVGGElement | null) => void; className?: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return <svg className={`preview-turntable ${className ?? ''}`} viewBox="20 0 288 190" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-deck`} x2="1" y2="1"><stop stopColor="#343639" /><stop offset="1" stopColor="#202124" /></linearGradient>
      <linearGradient id={`${id}-metal`}><stop stopColor="#666" /><stop offset=".5" stopColor="#ddd" /><stop offset="1" stopColor="#777" /></linearGradient>
      <radialGradient id={`${id}-pivot`}><stop stopColor="#b7b7b7" /><stop offset="1" stopColor="#45474c" /></radialGradient>
      <clipPath id={`${id}-label`}><circle cx="104" cy="95" r="29" /></clipPath>
    </defs>
    <rect x="20.5" y=".5" width="287" height="189" rx="15" fill={`url(#${id}-deck)`} stroke="#ffffff18" />
    <g ref={recordRef} className={`preview-record${playing ? ' playing' : ''}`}>
      <circle cx="104" cy="95" r="79" fill="#0005" />
      <circle cx="104" cy="95" r="77" fill="#111113" stroke="#ffffff24" />
      {[40, 53, 68].map(radius => <circle key={radius} cx="104" cy="95" r={radius} fill="none" stroke="#242424" strokeWidth="1" />)}
      <circle cx="104" cy="95" r="30" fill={accent} />
      <text x="104" y="98" textAnchor="middle" fill={foreground} fontSize="9" fontWeight="900" letterSpacing="1">S / S</text>
      {artwork && <image href={artwork} x="75" y="66" width="58" height="58" preserveAspectRatio="xMidYMid slice" clipPath={`url(#${id}-label)`} />}
    </g>
    <circle cx="104" cy="95" r="3" fill="#bcbfc3" stroke="#62656a" strokeWidth="1.5" />
    <g className={`preview-arm${playing ? ' on' : ''}`}>
      <rect x="243" y="36" width="7" height="108" rx="3.5" fill="#0005" transform="translate(3 3)" />
      <rect x="241.5" y="35" width="7" height="108" rx="3.5" fill={`url(#${id}-metal)`} />
      <rect x="238" y="132" width="14" height="24" rx="2" fill="#151619" stroke="#666" />
      <path d="M245 156v3" stroke="#bfc3c8" strokeWidth="2" />
    </g>
    <circle cx="245" cy="35" r="12" fill={`url(#${id}-pivot)`} />
    <text x="296" y="176" textAnchor="end" fill="#b7b9bc" fontSize="8" letterSpacing="2">33 ⅓ RPM</text>
  </svg>;
}
