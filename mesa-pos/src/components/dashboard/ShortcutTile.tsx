import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Tone } from './KpiCard'

export default function ShortcutTile({
  label,
  icon,
  tone,
  badge,
  to,
  onClick,
}: {
  label: string
  icon: ReactNode
  tone: Tone
  badge?: number
  to?: string
  onClick?: () => void
}) {
  const body = (
    <>
      {badge && badge > 0 ? (
        <span className="hd-tile-badge mesa-ltr-nums" aria-label={String(badge)}>
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
      <span className="hd-tile-icon">{icon}</span>
      <span className="hd-tile-label">{label}</span>
    </>
  )
  const className = `hd-tile hd-tone-${tone}`
  if (to) {
    return (
      <Link to={to} className={className}>
        {body}
      </Link>
    )
  }
  return (
    <button type="button" className={className} onClick={onClick}>
      {body}
    </button>
  )
}
