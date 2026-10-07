import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Tone } from './KpiCard'
import { IconChevron } from './dashIcons'

export default function LiveStatusCard({
  count,
  label,
  action,
  icon,
  tone,
  to,
}: {
  count: number
  label: string
  action: string
  icon: ReactNode
  tone: Tone
  to: string
}) {
  return (
    <Link to={to} className={`hd-live hd-tone-${tone}${count > 0 ? ' is-hot' : ''}`}>
      <span className="hd-live-icon">{icon}</span>
      <span className="hd-live-text">
        <strong className="mesa-ltr-nums">{count}</strong>
        <span>{label}</span>
        <em>{action}</em>
      </span>
      <span className="hd-live-go" aria-hidden>
        <IconChevron />
      </span>
    </Link>
  )
}
