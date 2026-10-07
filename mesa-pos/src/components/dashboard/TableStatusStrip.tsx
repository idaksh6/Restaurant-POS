import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Table } from '../../data/mock'
import { elapsedLabel, parseOpenedAt } from '../../lib/dashboardData'
import { useI18n } from '../../locale/i18n'
import { IconChevron, IconClock, IconPerson } from './dashIcons'

type Look = 'free' | 'busy' | 'billing' | 'reserved' | 'merged'

function lookOf(table: Table): Look {
  if (table.status === 'occupied') return 'busy'
  if (table.status === 'free') return 'free'
  return table.status
}

export default function TableStatusStrip({ tables, now }: { tables: Table[]; now: number }) {
  const { t } = useI18n()
  const railRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: true })

  const sorted = [...tables].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true }),
  )
  const counts = {
    free: tables.filter((tb) => tb.status === 'free').length,
    busy: tables.filter((tb) => tb.status === 'occupied' || tb.status === 'billing' || tb.status === 'merged').length,
    reserved: tables.filter((tb) => tb.status === 'reserved').length,
  }

  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const update = () => {
      const max = rail.scrollWidth - rail.clientWidth
      const pos = Math.abs(rail.scrollLeft)
      setEdges({ start: pos <= 2, end: pos >= max - 2 })
    }
    update()
    rail.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      rail.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [tables.length])

  function scrollBy(dir: 1 | -1) {
    const rail = railRef.current
    if (!rail) return
    const rtl = getComputedStyle(rail).direction === 'rtl'
    rail.scrollBy({ left: dir * (rtl ? -1 : 1) * rail.clientWidth * 0.8, behavior: 'smooth' })
  }

  const label: Record<Look, string> = {
    free: t.dashAvailable,
    busy: t.dashOccupied,
    billing: t.dashStatusBilling,
    reserved: t.dashReserved,
    merged: t.dashMerged,
  }

  return (
    <section className="hd-section hd-tables" aria-labelledby="hd-tables-title">
      <header className="hd-section-head hd-tables-head">
        <h2 id="hd-tables-title">{t.dashTableStatus}</h2>
        <ul className="hd-legend">
          <li className="is-free">
            {t.dashAvailable} <b className="mesa-ltr-nums">({counts.free})</b>
          </li>
          <li className="is-busy">
            {t.dashOccupied} <b className="mesa-ltr-nums">({counts.busy})</b>
          </li>
          <li className="is-reserved">
            {t.dashReserved} <b className="mesa-ltr-nums">({counts.reserved})</b>
          </li>
        </ul>
        <Link to="/dine-in" className="hd-link">
          {t.dashViewAllTables}
        </Link>
      </header>

      {sorted.length === 0 ? (
        <p className="hd-empty">{t.dashNoTables}</p>
      ) : (
        <div className="hd-tables-wrap">
          <div className="hd-tables-rail" ref={railRef}>
            {sorted.map((table) => {
              const look = lookOf(table)
              const opened = look === 'busy' || look === 'billing' ? parseOpenedAt(table.openedAt, now) : null
              return (
                <Link
                  key={table.id}
                  to={`/dine-in?table=${encodeURIComponent(table.id)}`}
                  className={`hd-table is-${look}`}
                  title={`${table.label} · ${table.area} · ${label[look]}`}
                >
                  {opened ? (
                    <span className="hd-table-timer mesa-ltr-nums">
                      <IconClock />
                      {elapsedLabel(opened, now)}
                    </span>
                  ) : null}
                  <strong className="mesa-ltr-nums">{/^\d+$/.test(table.label) ? `T${Number(table.label)}` : table.label}</strong>
                  <span className="hd-table-seats mesa-ltr-nums" aria-label={t.dashSeats.replace('{n}', String(table.seats))}>
                    <IconPerson />
                    {table.guests && look !== 'free' ? `${table.guests}/${table.seats}` : table.seats}
                  </span>
                  <em>{label[look]}</em>
                </Link>
              )
            })}
          </div>
          {!edges.start ? (
            <button type="button" className="hd-rail-btn is-back" onClick={() => scrollBy(-1)} aria-label={t.dashScrollBack} title={t.dashScrollBack}>
              <IconChevron />
            </button>
          ) : null}
          {!edges.end ? (
            <button type="button" className="hd-rail-btn is-next" onClick={() => scrollBy(1)} aria-label={t.dashScrollForward} title={t.dashScrollForward}>
              <IconChevron />
            </button>
          ) : null}
        </div>
      )}
    </section>
  )
}
