import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { IconChevron } from './dashIcons'

export type Tone = 'green' | 'orange' | 'blue' | 'purple' | 'pink' | 'teal' | 'slate'

export default function KpiCard({
  label,
  value,
  sub,
  icon,
  tone,
  to,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  icon: ReactNode
  tone: Tone
  to?: string
}) {
  const body = (
    <>
      <span className="hd-kpi-icon">{icon}</span>
      <span className="hd-kpi-text">
        <span className="hd-kpi-label">{label}</span>
        <strong className="hd-kpi-value mesa-ltr-nums">{value}</strong>
        {sub ? <span className="hd-kpi-sub">{sub}</span> : null}
      </span>
      {to ? (
        <span className="hd-kpi-go" aria-hidden>
          <IconChevron />
        </span>
      ) : null}
    </>
  )
  const className = `hd-kpi hd-tone-${tone}`
  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}
