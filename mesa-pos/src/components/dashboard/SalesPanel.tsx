import { useEffect, useMemo, useRef, useState } from 'react'
import { money } from '../../data/mock'
import type { LedgerEntry } from '../../data/ledger'
import { dayKeyFromToday, daySales, type SalesPoint } from '../../lib/dashboardData'
import { localeTag, useI18n } from '../../locale/i18n'
import MesaSelect from '../MesaSelect'

const CHART_H = 150
const PAD = { top: 10, right: 8, bottom: 22, left: 40 }

function niceCeil(value: number) {
  if (value <= 0) return 100
  const raw = value / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  return step * 4
}

function compact(n: number) {
  return n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(Math.round(n))
}

function SalesChart({ points, label }: { points: SalesPoint[]; label: string }) {
  const { lang } = useI18n()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const max = niceCeil(Math.max(...points.map((p) => p.total), 0))
  const innerW = Math.max(0, width - PAD.left - PAD.right)
  const innerH = CHART_H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (points.length > 1 ? (i / (points.length - 1)) * innerW : innerW / 2)
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH

  let line = ''
  points.forEach((p, i) => {
    if (i === 0) {
      line = `M${x(0)},${y(p.total)}`
      return
    }
    const xm = (x(i - 1) + x(i)) / 2
    line += ` C${xm},${y(points[i - 1].total)} ${xm},${y(p.total)} ${x(i)},${y(p.total)}`
  })
  const area = points.length
    ? `${line} L${x(points.length - 1)},${PAD.top + innerH} L${x(0)},${PAD.top + innerH} Z`
    : ''
  const every = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(innerW / 52))))
  const hourLabel = (h: number) => {
    const d = new Date()
    d.setHours(h, 0, 0, 0)
    return d.toLocaleTimeString(localeTag(lang), { hour: 'numeric' })
  }
  const last = points[points.length - 1]

  return (
    <div className="hd-chart" ref={wrapRef}>
      {width > 0 ? (
        <svg width={width} height={CHART_H} role="img" aria-label={label}>
          <defs>
            <linearGradient id="hd-chart-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1f9d6b" stopOpacity="0.28" />
              <stop offset="1" stopColor="#1f9d6b" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3, 4].map((i) => {
            const v = (max / 4) * i
            return (
              <g key={i}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} className="hd-chart-grid" />
                <text x={PAD.left - 6} y={y(v)} className="hd-chart-axis" textAnchor="end" dominantBaseline="middle">
                  {compact(v)}
                </text>
              </g>
            )
          })}
          {points.map((p, i) =>
            i % every === 0 || i === points.length - 1 ? (
              <text key={p.hour} x={x(i)} y={CHART_H - 6} className="hd-chart-axis" textAnchor="middle">
                {hourLabel(p.hour)}
              </text>
            ) : null,
          )}
          {area ? <path d={area} fill="url(#hd-chart-fill)" /> : null}
          {line ? <path d={line} className="hd-chart-line" /> : null}
          {last ? <circle cx={x(points.length - 1)} cy={y(last.total)} r="3.5" className="hd-chart-dot" /> : null}
        </svg>
      ) : null}
    </div>
  )
}

export default function SalesPanel({ ledger, loading }: { ledger: LedgerEntry[]; loading: boolean }) {
  const { t } = useI18n()
  const [range, setRange] = useState<'today' | 'yesterday'>('today')
  const summary = useMemo(
    () => daySales(ledger, dayKeyFromToday(range === 'today' ? 0 : -1), range === 'today'),
    [ledger, range],
  )

  return (
    <section className="hd-card hd-sales" aria-labelledby="hd-sales-title">
      <header className="hd-card-head">
        <div>
          <h2 id="hd-sales-title">{range === 'today' ? t.dashTodaysSales : t.dashYesterday}</h2>
          {loading ? (
            <span className="hd-skel hd-skel-value" />
          ) : (
            <strong className="hd-sales-value mesa-ltr-nums">{money(summary.total)}</strong>
          )}
        </div>
        <MesaSelect
          className="hd-range"
          aria-label={t.dashSalesChart}
          value={range}
          onChange={(v) => setRange(v === 'yesterday' ? 'yesterday' : 'today')}
          options={[
            { value: 'today', label: t.dashToday },
            { value: 'yesterday', label: t.dashYesterday },
          ]}
        />
      </header>

      {loading ? (
        <div className="hd-skel hd-skel-chart" aria-busy="true" />
      ) : (
        <div className="hd-chart-box">
          <SalesChart points={summary.points} label={t.dashSalesChart} />
          {summary.total === 0 ? <p className="hd-chart-empty">{t.dashNoSalesDay}</p> : null}
        </div>
      )}

      <div className="hd-sales-stats">
        <div className="hd-tone-green">
          <strong className="mesa-ltr-nums">{loading ? '—' : summary.orders}</strong>
          <span>{t.dashOrders}</span>
        </div>
        <div className="hd-tone-orange">
          <strong className="mesa-ltr-nums">{loading ? '—' : summary.items}</strong>
          <span>{t.dashItemsSold}</span>
        </div>
        <div className="hd-tone-purple">
          <strong className="mesa-ltr-nums">{loading ? '—' : summary.customers}</strong>
          <span>{t.dashCustomers}</span>
        </div>
      </div>
    </section>
  )
}
