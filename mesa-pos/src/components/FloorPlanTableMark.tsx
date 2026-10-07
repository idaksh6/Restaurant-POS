/** Top-down floor-plan table: clear Free / Occupied / Billing colors. */
import { useId } from 'react'

export default function FloorPlanTableMark({
  seats = 4,
  status = 'free',
  className,
}: {
  seats?: number
  status?: string
  className?: string
}) {
  const n = seats <= 2 ? 2 : seats <= 4 ? 4 : seats <= 6 ? 6 : 8
  const uid = `ftp-${useId().replace(/:/g, '')}`

  const free = status === 'free'
  const billing = status === 'billing'
  const merged = status === 'merged'
  const top = free ? '#edd4a8' : billing ? '#e8a56a' : merged ? '#c5b8d4' : '#b8956f'
  const inner = free ? '#dfc08a' : billing ? '#d4894a' : merged ? '#9f8bb8' : '#9a7a58'
  const seat = free ? '#7bc98a' : billing ? '#f0b07a' : merged ? '#7a6a9a' : '#5a9e88'
  const ring = free ? '#2f9e44' : billing ? '#c45c26' : merged ? '#5c4d7a' : '#1f6b5c'

  return (
    <svg
      className={className}
      viewBox="0 0 80 80"
      fill="none"
      aria-hidden
      style={{ overflow: 'visible' }}
    >
      <defs>
        <filter id={uid} x="-25%" y="-15%" width="150%" height="150%">
          <feDropShadow dx="1" dy="2" stdDeviation="1.3" floodColor="#1a2a35" floodOpacity="0.3" />
        </filter>
      </defs>

      <circle cx="40" cy="40" r="36" fill={ring} opacity="0.14" />

      {n === 2 ? (
        <g filter={`url(#${uid})`}>
          <rect x="28" y="6" width="24" height="11" rx="5.5" fill={seat} />
          <rect x="28" y="63" width="24" height="11" rx="5.5" fill={seat} />
          <circle cx="40" cy="40" r="22" fill={top} />
          <circle cx="40" cy="40" r="14" fill={inner} />
          <ellipse cx="33" cy="34" rx="5" ry="3.2" fill="#fff" opacity="0.28" />
        </g>
      ) : null}

      {n === 4 ? (
        <g filter={`url(#${uid})`}>
          <rect x="28" y="4" width="24" height="11" rx="5.5" fill={seat} />
          <rect x="28" y="65" width="24" height="11" rx="5.5" fill={seat} />
          <rect x="4" y="28" width="11" height="24" rx="5.5" fill={seat} />
          <rect x="65" y="28" width="11" height="24" rx="5.5" fill={seat} />
          <circle cx="40" cy="40" r="20" fill={top} />
          <circle cx="40" cy="40" r="12.5" fill={inner} />
          <ellipse cx="33" cy="34" rx="5" ry="3.2" fill="#fff" opacity="0.28" />
        </g>
      ) : null}

      {n === 6 ? (
        <g filter={`url(#${uid})`}>
          <rect x="14" y="5" width="18" height="10" rx="5" fill={seat} />
          <rect x="48" y="5" width="18" height="10" rx="5" fill={seat} />
          <rect x="14" y="65" width="18" height="10" rx="5" fill={seat} />
          <rect x="48" y="65" width="18" height="10" rx="5" fill={seat} />
          <rect x="4" y="30" width="10" height="20" rx="5" fill={seat} />
          <rect x="66" y="30" width="10" height="20" rx="5" fill={seat} />
          <rect x="16" y="22" width="48" height="36" rx="18" fill={top} />
          <rect x="24" y="29" width="32" height="22" rx="11" fill={inner} />
          <ellipse cx="30" cy="34" rx="6" ry="3.2" fill="#fff" opacity="0.25" />
        </g>
      ) : null}

      {n === 8 ? (
        <g filter={`url(#${uid})`}>
          <rect x="12" y="5" width="16" height="10" rx="5" fill={seat} />
          <rect x="32" y="5" width="16" height="10" rx="5" fill={seat} />
          <rect x="52" y="5" width="16" height="10" rx="5" fill={seat} />
          <rect x="12" y="65" width="16" height="10" rx="5" fill={seat} />
          <rect x="32" y="65" width="16" height="10" rx="5" fill={seat} />
          <rect x="52" y="65" width="16" height="10" rx="5" fill={seat} />
          <rect x="4" y="30" width="10" height="20" rx="5" fill={seat} />
          <rect x="66" y="30" width="10" height="20" rx="5" fill={seat} />
          <rect x="14" y="20" width="52" height="40" rx="14" fill={top} />
          <rect x="22" y="28" width="36" height="24" rx="10" fill={inner} />
          <ellipse cx="30" cy="34" rx="7" ry="3.5" fill="#fff" opacity="0.25" />
        </g>
      ) : null}
    </svg>
  )
}
