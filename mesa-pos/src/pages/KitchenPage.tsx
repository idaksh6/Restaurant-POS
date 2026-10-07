import { useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import DashHeader from '../components/DashHeader'
import { HubFooter } from '../components/HubChrome'
import type { KitchenTicket, KitchenTicketStatus } from '../data/mock'
import {
  aggregateKitchenStatus,
  lineEffectiveStatus,
  listKdsStations,
  type KdsBoardMode,
  type KdsStation,
} from '../lib/kdsStations'
import { useI18n } from '../locale/i18n'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'

type StatusFilter = 'open' | Exclude<KitchenTicketStatus, 'done'>

function KdsIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="kds-ico"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

function IconPot() {
  return (
    <KdsIcon>
      <path d="M4 10h16v9H4v-9Z" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <path d="M9 14h6" />
    </KdsIcon>
  )
}

function IconBoard() {
  return (
    <KdsIcon>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </KdsIcon>
  )
}

function IconQueue() {
  return (
    <KdsIcon>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </KdsIcon>
  )
}

function IconFlame() {
  return (
    <KdsIcon>
      <path d="M12 3c2 3 5 4.5 5 8a5 5 0 1 1-10 0c0-2.2 1.4-3.8 2.5-5 .6 1.5 1.6 2.2 2.5 2.5V3Z" />
    </KdsIcon>
  )
}

function IconCheck() {
  return (
    <KdsIcon>
      <circle cx="12" cy="12" r="8" />
      <path d="M8.5 12.5 11 15l4.5-5" />
    </KdsIcon>
  )
}

function IconAll() {
  return (
    <KdsIcon>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </KdsIcon>
  )
}

function IconCup() {
  return (
    <KdsIcon>
      <path d="M6 8h10v6a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4V8Z" />
      <path d="M16 9h2.5a2.5 2.5 0 0 1 0 5H16" />
    </KdsIcon>
  )
}

function parseBoard(value: string | null): KdsBoardMode {
  if (value === 'kitchen' || value === 'bar' || value === 'expo') return value
  return 'all'
}

function isOpenStatus(st: KitchenTicketStatus) {
  return st !== 'ready' && st !== 'done'
}

function visibleLines(
  ticket: KitchenTicket,
  stationId: string | 'all',
  board: KdsBoardMode,
  stations: KdsStation[],
) {
  return ticket.lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => {
      const ls = lineEffectiveStatus(line.status, ticket.status)
      if (ls === 'done') return false
      if (board === 'expo' && ls !== 'ready') return false
      const sid = line.stationId
      const station = stations.find((s) => s.id === sid)
      if (board === 'kitchen' && station?.board === 'bar') return false
      if (board === 'bar' && station?.board !== 'bar') return false
      if (stationId !== 'all' && sid !== stationId) return false
      return true
    })
}

function ticketBoardStatus(
  ticket: KitchenTicket,
  lines: ReturnType<typeof visibleLines>,
): KitchenTicketStatus {
  if (!lines.length) return ticket.status
  return aggregateKitchenStatus(
    lines.map(({ line }) => lineEffectiveStatus(line.status, ticket.status)),
  )
}

function stationOpenCount(kitchen: KitchenTicket[], stationId: string) {
  return kitchen.filter((ticket) =>
    ticket.lines.some((line) => {
      if (line.stationId !== stationId) return false
      return isOpenStatus(lineEffectiveStatus(line.status, ticket.status))
    }),
  ).length
}

export default function KitchenPage() {
  const { t } = useI18n()
  const { kitchen, setKitchenStatus, setKitchenLineStatus, dismissKitchen } = usePos()
  const { categories, dishes } = useMasters()
  const [searchParams, setSearchParams] = useSearchParams()
  const board = parseBoard(searchParams.get('board'))
  const stationId = searchParams.get('station') || 'all'
  const [status, setStatus] = useState<StatusFilter>('open')
  const [search, setSearch] = useState('')

  const stations = useMemo(
    () => listKdsStations(undefined, categories),
    [kitchen.length, dishes.length, categories],
  )

  const stationCounts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of stations) map[s.id] = stationOpenCount(kitchen, s.id)
    return map
  }, [kitchen, stations])

  const counts = useMemo(() => {
    const scoped = kitchen
      .map((ticket) => {
        const lines = visibleLines(ticket, stationId, board, stations)
        if (!lines.length) {
          if (board === 'expo') return null
          if (stationId !== 'all' || board === 'kitchen' || board === 'bar') return null
        }
        const st =
          board === 'expo'
            ? 'ready'
            : ticketBoardStatus(
                ticket,
                lines.length ? lines : ticket.lines.map((line, index) => ({ line, index })),
              )
        if (board === 'expo' && !lines.length) return null
        return { ticket, lines, st }
      })
      .filter(Boolean) as Array<{
      ticket: KitchenTicket
      lines: ReturnType<typeof visibleLines>
      st: KitchenTicketStatus
    }>

    return {
      open: scoped.filter((k) => isOpenStatus(k.st)).length,
      queued: scoped.filter((k) => k.st === 'queued').length,
      cooking: scoped.filter((k) => k.st === 'cooking').length,
      ready: scoped.filter((k) => k.st === 'ready').length,
      high: scoped.filter((k) => k.ticket.priority === 'high' && isOpenStatus(k.st)).length,
      scoped,
    }
  }, [kitchen, stationId, board, stations])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return counts.scoped.filter(({ ticket, st, lines }) => {
      if (board === 'expo') return lines.some(({ line }) => lineEffectiveStatus(line.status, ticket.status) === 'ready')
      if (status === 'open' && !isOpenStatus(st)) return false
      if (status !== 'open' && st !== status) return false
      if (!q) return true
      const hay = [ticket.source, ticket.id, ...lines.map(({ line }) => `${line.name} ${line.qty}`)]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [counts.scoped, status, search, board])

  const tabs = [
    { id: 'open' as const, label: t.kotBoard, count: counts.open, icon: <IconBoard />, tone: 'board' },
    { id: 'queued' as const, label: t.kotQueued, count: counts.queued, icon: <IconQueue />, tone: 'queued' },
    { id: 'cooking' as const, label: t.kotCooking, count: counts.cooking, icon: <IconFlame />, tone: 'cooking' },
    { id: 'ready' as const, label: t.kotReady, count: counts.ready, icon: <IconCheck />, tone: 'ready' },
  ]

  function setBoard(next: KdsBoardMode) {
    const params = new URLSearchParams(searchParams)
    if (next === 'all') params.delete('board')
    else params.set('board', next)
    if (next === 'expo') params.delete('station')
    setSearchParams(params, { replace: true })
  }

  function setStation(id: string) {
    const params = new URLSearchParams(searchParams)
    if (id === 'all') params.delete('station')
    else params.set('station', id)
    setSearchParams(params, { replace: true })
  }

  return (
    <div className="zk-dept zk-kds">
      <DashHeader search={search} onSearchChange={setSearch} brandTo="/" />

      <div className="kds-page-inner">
        <header className="kds-hero">
          <div className="kds-hero-brand">
            <span className="kds-hero-mark">
              {board === 'bar' ? <IconCup /> : <IconPot />}
            </span>
            <div>
              <h1>
                {board === 'expo'
                  ? t.kdsTitleExpo
                  : board === 'bar'
                    ? t.kdsTitleBar
                    : board === 'kitchen'
                      ? t.kdsTitleKitchen
                      : t.kitchen}
              </h1>
              <p>
                {counts.open} {t.kotOpen}
                {counts.high ? ` · ${counts.high} ${t.kotHigh}` : ''}
              </p>
            </div>
          </div>
          <div className="kds-hero-stats">
            <span className="kds-stat tone-queued">
              <IconQueue />
              <strong className="mesa-ltr-nums">{counts.queued}</strong>
              <em>{t.kotQueued}</em>
            </span>
            <span className="kds-stat tone-cooking">
              <IconFlame />
              <strong className="mesa-ltr-nums">{counts.cooking}</strong>
              <em>{t.kotCooking}</em>
            </span>
            <span className="kds-stat tone-ready">
              <IconCheck />
              <strong className="mesa-ltr-nums">{counts.ready}</strong>
              <em>{t.kotReady}</em>
            </span>
          </div>
        </header>

        <div className="kds-filters kds-boards" role="tablist" aria-label={t.kdsStations}>
          {(
            [
              ['all', t.kdsBoardAll],
              ['kitchen', t.kdsBoardKitchen],
              ['bar', t.kdsBoardBar],
              ['expo', t.kdsBoardExpo],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`kds-tab tone-board${board === id ? ' on' : ''}`}
              onClick={() => setBoard(id)}
            >
              <span>{label}</span>
            </button>
          ))}
        </div>

        {board !== 'expo' ? (
          <div className="kds-filters kds-status" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`kds-tab tone-${tab.tone}${status === tab.id ? ' on' : ''}`}
                onClick={() => setStatus(tab.id)}
              >
                <span className="kds-tab-ico">{tab.icon}</span>
                <span>{tab.label}</span>
                <em className="mesa-ltr-nums">{tab.count}</em>
              </button>
            ))}
          </div>
        ) : null}

        <div className="zk-dept-body kds-body">
          <aside className="zk-dept-tree kds-tree" aria-label={t.kdsStations}>
            <div className="kds-tree-head">
              <strong>{t.kdsStations}</strong>
              <span>{stations.length}</span>
            </div>
            <button
              type="button"
              className={`zk-tree-all kds-tree-all${stationId === 'all' ? ' active' : ''}`}
              onClick={() => setStation('all')}
            >
              <span className="kds-tree-ico">
                <IconAll />
              </span>
              {t.all}
            </button>
            {stations
              .filter((s) => board === 'all' || board === 'expo' || s.board === board)
              .map((station) => (
                <button
                  key={station.id}
                  type="button"
                  className={`zk-tree-label kds-tree-label${stationId === station.id ? ' active' : ''}`}
                  onClick={() => setStation(station.id)}
                  style={{ display: 'flex', width: '100%', marginTop: 4, alignItems: 'center', gap: 8 }}
                >
                  <span className="kds-tree-ico">
                    {station.board === 'bar' ? <IconCup /> : <IconPot />}
                  </span>
                  <span style={{ flex: 1, textAlign: 'start' }}>{station.name}</span>
                  {(stationCounts[station.id] ?? 0) > 0 ? (
                    <em className="mesa-ltr-nums" style={{ opacity: 0.75, fontStyle: 'normal' }}>
                      {stationCounts[station.id]}
                    </em>
                  ) : null}
                </button>
              ))}
            <p className="kds-tree-hint">{t.kdsStationsHint}</p>
          </aside>

          <section className="zk-dept-grid-wrap kds-board">
            <div className="kds-board-head">
              <div>
                <strong>
                  {board === 'expo'
                    ? t.kdsExpoReady
                    : status === 'open'
                      ? t.kotBoard
                      : status === 'queued'
                        ? t.kotQueued
                        : status === 'cooking'
                          ? t.kotCooking
                          : t.kotReady}
                </strong>
                <p>
                  {filtered.length}{' '}
                  {filtered.length === 1 ? t.kdsTicketsOne : t.kdsTicketsMany}
                  {stationId !== 'all'
                    ? ` · ${stations.find((s) => s.id === stationId)?.name ?? ''}`
                    : ''}
                </p>
              </div>
              <span className={`kds-board-chip tone-${board === 'expo' ? 'ready' : status}`}>
                {filtered.length}
              </span>
            </div>
            {filtered.length === 0 ? (
              <div className="kds-empty">
                <span className="kds-empty-ico">
                  <IconPot />
                </span>
                <strong>{t.noKots}</strong>
                <span>{t.kotEmptyHint}</span>
              </div>
            ) : (
              <div className="kds-grid">
                {filtered.map(({ ticket, lines, st }) => {
                  const showLines = lines.length
                    ? lines
                    : ticket.lines
                        .map((line, index) => ({ line, index }))
                        .filter(({ line }) => lineEffectiveStatus(line.status, ticket.status) !== 'done')
                  const statusLabel =
                    st === 'cooking' ? t.kotCooking : st === 'ready' ? t.kotReady : t.kotQueued
                  const priorityLabel = ticket.priority === 'high' ? t.kotHigh : t.kotNormal
                  return (
                    <article
                      key={ticket.id}
                      className={`kds-card status-${st}${ticket.priority === 'high' ? ' priority-high' : ''}`}
                    >
                      <div className={`kds-card-stripe status-${st}`} />
                      <header>
                        <div className="kds-card-title">
                          <span className={`kds-source-ico status-${st}`}>
                            {st === 'cooking' ? (
                              <IconFlame />
                            ) : st === 'ready' ? (
                              <IconCheck />
                            ) : (
                              <IconQueue />
                            )}
                          </span>
                          <strong>{ticket.source}</strong>
                        </div>
                        <span
                          className={`kds-badge ${
                            st === 'ready' ? 'ok' : st === 'cooking' ? 'cook' : ticket.priority === 'high' ? 'high' : 'warn'
                          }`}
                        >
                          {priorityLabel} · {statusLabel}
                        </span>
                      </header>
                      <p className="kds-time mesa-ltr-nums">
                        {t.kotReceived} {ticket.createdAt}
                      </p>
                      <ul>
                        {showLines.map(({ line, index }) => {
                          const ls = lineEffectiveStatus(line.status, ticket.status)
                          const stationName = stations.find((s) => s.id === line.stationId)?.name
                          return (
                            <li key={`${ticket.id}-${index}`} className={`kds-line status-${ls}`}>
                              <div>
                                <strong className="mesa-ltr-nums">{line.qty}×</strong> {line.name}
                                {stationName && stationId === 'all' ? (
                                  <em style={{ opacity: 0.65, marginInlineStart: 6 }}>{stationName}</em>
                                ) : null}
                              </div>
                              <div className="kds-line-actions">
                                {ls === 'queued' ? (
                                  <button
                                    type="button"
                                    className="btn btn-ghost kds-act cook"
                                    onClick={() => setKitchenLineStatus(ticket.id, index, 'cooking')}
                                  >
                                    {t.kotCooking}
                                  </button>
                                ) : null}
                                {ls === 'queued' || ls === 'cooking' ? (
                                  <button
                                    type="button"
                                    className="btn btn-teal kds-act ready"
                                    onClick={() => setKitchenLineStatus(ticket.id, index, 'ready')}
                                  >
                                    {t.kotReady}
                                  </button>
                                ) : null}
                                {ls === 'ready' ? (
                                  <button
                                    type="button"
                                    className="btn btn-teal kds-act done"
                                    onClick={() => setKitchenLineStatus(ticket.id, index, 'done')}
                                  >
                                    {t.kotDone}
                                  </button>
                                ) : null}
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                      <div className="action-row kds-actions">
                        {board !== 'expo' && st === 'queued' ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-teal kds-act cook"
                              onClick={() => setKitchenStatus(ticket.id, 'cooking')}
                            >
                              <IconFlame />
                              {t.kotCooking}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost kds-act ready"
                              onClick={() => setKitchenStatus(ticket.id, 'ready')}
                            >
                              <IconCheck />
                              {t.kotReady}
                            </button>
                          </>
                        ) : null}
                        {board !== 'expo' && st === 'cooking' ? (
                          <button
                            type="button"
                            className="btn btn-teal kds-act ready"
                            onClick={() => setKitchenStatus(ticket.id, 'ready')}
                          >
                            <IconCheck />
                            {t.kotReady}
                          </button>
                        ) : null}
                        {st === 'ready' || board === 'expo' ? (
                          <button
                            type="button"
                            className="btn btn-teal kds-act done"
                            onClick={() => dismissKitchen(ticket.id)}
                          >
                            <IconCheck />
                            {t.kotDone}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      <HubFooter backTo="/" backLabel={t.home} />
    </div>
  )
}
