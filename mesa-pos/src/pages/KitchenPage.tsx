import { useMemo, useState, type ReactNode } from 'react'
import DashHeader from '../components/DashHeader'
import { HubFooter } from '../components/HubChrome'
import type { KitchenTicketStatus } from '../data/mock'
import { useI18n } from '../locale/i18n'
import { useMasters } from '../state/MastersContext'
import { usePos } from '../state/PosContext'

type StatusFilter = 'open' | KitchenTicketStatus

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

function IconFood() {
  return (
    <KdsIcon>
      <path d="M4 11h16v2a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6v-2Z" />
      <path d="M8 11V7M12 11V5M16 11V8" />
    </KdsIcon>
  )
}

function IconPizza() {
  return (
    <KdsIcon>
      <path d="M3 10.5 12 3l9 7.5-3.5 10H6.5L3 10.5Z" />
      <circle cx="10" cy="11" r="1" />
      <circle cx="14" cy="13" r="1" />
      <circle cx="12" cy="16" r="1" />
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

function IconCake() {
  return (
    <KdsIcon>
      <path d="M4 14h16v5H4v-5Z" />
      <path d="M5 14c0-2.5 2-4.5 7-4.5s7 2 7 4.5" />
      <path d="M12 6v3.5M10 6.5l2-.8 2 .8" />
    </KdsIcon>
  )
}

function IconFolder() {
  return (
    <KdsIcon>
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7H9l2 2h8.5A1.5 1.5 0 0 1 21 10.5v7A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-9Z" />
    </KdsIcon>
  )
}

function categoryIcon(name: string) {
  const n = name.toLowerCase()
  if (/food|grill|main|starter|side|مطعم|طعام|مشوي|مقبل/.test(n)) return <IconFood />
  if (/pizza|بيتزا/.test(n)) return <IconPizza />
  if (/bev|drink|coffee|tea|juice|مشروب|بارد|ساخن|قهوة/.test(n)) return <IconCup />
  if (/dessert|sweet|cake|حلو|حلوا|كنافة/.test(n)) return <IconCake />
  return <IconFolder />
}

export default function KitchenPage() {
  const { t } = useI18n()
  const { kitchen, setKitchenStatus, dismissKitchen } = usePos()
  const { categories, dishes } = useMasters()
  const [deptId, setDeptId] = useState<'all' | string>('all')
  const [status, setStatus] = useState<StatusFilter>('open')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')

  const mains = useMemo(
    () => categories.filter((c) => !c.parentId && c.active).sort((a, b) => a.sort - b.sort),
    [categories],
  )
  const subs = useMemo(
    () => categories.filter((c) => c.parentId && c.active).sort((a, b) => a.sort - b.sort),
    [categories],
  )

  const counts = useMemo(
    () => ({
      open: kitchen.filter((k) => k.status !== 'ready').length,
      queued: kitchen.filter((k) => k.status === 'queued').length,
      cooking: kitchen.filter((k) => k.status === 'cooking').length,
      ready: kitchen.filter((k) => k.status === 'ready').length,
      high: kitchen.filter((k) => k.priority === 'high' && k.status !== 'ready').length,
    }),
    [kitchen],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return kitchen.filter((ticket) => {
      if (status === 'open' && ticket.status === 'ready') return false
      if (status !== 'open' && ticket.status !== status) return false
      if (deptId !== 'all') {
        const inDept = ticket.lines.some((line) => {
          const dish = dishes.find((d) => d.id === line.itemId)
          if (!dish) return false
          const cat = categories.find((c) => c.id === dish.categoryId)
          return dish.categoryId === deptId || cat?.parentId === deptId || cat?.id === deptId
        })
        if (!inDept) return false
      }
      if (!q) return true
      const hay = [
        ticket.source,
        ticket.id,
        ...ticket.lines.map((l) => `${l.name} ${l.qty}`),
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [kitchen, status, deptId, dishes, categories, search])

  const tabs = [
    { id: 'open' as const, label: t.kotBoard, count: counts.open, icon: <IconBoard />, tone: 'board' },
    { id: 'queued' as const, label: t.kotQueued, count: counts.queued, icon: <IconQueue />, tone: 'queued' },
    { id: 'cooking' as const, label: t.kotCooking, count: counts.cooking, icon: <IconFlame />, tone: 'cooking' },
    { id: 'ready' as const, label: t.kotReady, count: counts.ready, icon: <IconCheck />, tone: 'ready' },
  ]

  return (
    <div className="zk-dept zk-kds">
      <DashHeader search={search} onSearchChange={setSearch} brandTo="/" />

      <div className="kds-page-inner">
        <header className="kds-hero">
          <div className="kds-hero-brand">
            <span className="kds-hero-mark">
              <IconPot />
            </span>
            <div>
              <h1>{t.kitchen}</h1>
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

        <div className="zk-dept-body kds-body">
          <aside className="zk-dept-tree kds-tree" aria-label="Departments">
            <div className="kds-tree-head">
              <strong>Departments</strong>
              <span>{mains.length}</span>
            </div>
            <button
              type="button"
              className={`zk-tree-all kds-tree-all${deptId === 'all' ? ' active' : ''}`}
              onClick={() => setDeptId('all')}
            >
              <span className="kds-tree-ico">
                <IconAll />
              </span>
              {t.all}
            </button>
            {mains.map((main) => {
              const children = subs.filter((s) => s.parentId === main.id)
              const open = expanded[main.id] ?? true
              return (
                <div key={main.id} className="zk-tree-block">
                  <div className="zk-tree-main">
                    <button
                      type="button"
                      className="zk-tree-toggle"
                      aria-label={open ? t.collapse : t.expand}
                      onClick={() => setExpanded((prev) => ({ ...prev, [main.id]: !open }))}
                    >
                      {open ? '▾' : '▸'}
                    </button>
                    <button
                      type="button"
                      className={`zk-tree-label kds-tree-label${deptId === main.id ? ' active' : ''}`}
                      onClick={() => setDeptId(main.id)}
                    >
                      <span className="kds-tree-ico">{categoryIcon(main.name)}</span>
                      {main.name}
                    </button>
                  </div>
                  {open ? (
                    <div className="zk-tree-subs">
                      {children.map((sub) => (
                        <button
                          key={sub.id}
                          type="button"
                          className={deptId === sub.id ? 'active' : ''}
                          onClick={() => setDeptId(sub.id)}
                        >
                          {sub.name}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </aside>

          <section className="zk-dept-grid-wrap kds-board">
            <div className="kds-board-head">
              <div>
                <strong>
                  {status === 'open'
                    ? t.kotBoard
                    : status === 'queued'
                      ? t.kotQueued
                      : status === 'cooking'
                        ? t.kotCooking
                        : t.kotReady}
                </strong>
                <p>
                  {filtered.length} ticket{filtered.length === 1 ? '' : 's'}
                  {deptId !== 'all'
                    ? ` · ${categories.find((c) => c.id === deptId)?.name ?? ''}`
                    : ''}
                </p>
              </div>
              <span className={`kds-board-chip tone-${status}`}>{filtered.length}</span>
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
                {filtered.map((ticket) => {
                  const statusLabel =
                    ticket.status === 'cooking'
                      ? t.kotCooking
                      : ticket.status === 'ready'
                        ? t.kotReady
                        : t.kotQueued
                  const priorityLabel = ticket.priority === 'high' ? t.kotHigh : t.kotNormal
                  return (
                    <article
                      key={ticket.id}
                      className={`kds-card status-${ticket.status}${ticket.priority === 'high' ? ' priority-high' : ''}`}
                    >
                      <div className={`kds-card-stripe status-${ticket.status}`} />
                      <header>
                        <div className="kds-card-title">
                          <span className={`kds-source-ico status-${ticket.status}`}>
                            {ticket.status === 'cooking' ? (
                              <IconFlame />
                            ) : ticket.status === 'ready' ? (
                              <IconCheck />
                            ) : (
                              <IconQueue />
                            )}
                          </span>
                          <strong>{ticket.source}</strong>
                        </div>
                        <span
                          className={`kds-badge ${
                            ticket.status === 'ready'
                              ? 'ok'
                              : ticket.status === 'cooking'
                                ? 'cook'
                                : ticket.priority === 'high'
                                  ? 'high'
                                  : 'warn'
                          }`}
                        >
                          {priorityLabel} · {statusLabel}
                        </span>
                      </header>
                      <p className="kds-time mesa-ltr-nums">
                        {t.kotReceived} {ticket.createdAt}
                      </p>
                      <ul>
                        {ticket.lines.map((line, idx) => (
                          <li key={`${ticket.id}-${idx}`}>
                            <strong className="mesa-ltr-nums">{line.qty}×</strong> {line.name}
                          </li>
                        ))}
                      </ul>
                      <div className="action-row kds-actions">
                        {ticket.status === 'queued' ? (
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
                        ) : ticket.status === 'cooking' ? (
                          <button
                            type="button"
                            className="btn btn-teal kds-act ready"
                            onClick={() => setKitchenStatus(ticket.id, 'ready')}
                          >
                            <IconCheck />
                            {t.kotReady}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-teal kds-act done"
                            onClick={() => dismissKitchen(ticket.id)}
                          >
                            <IconCheck />
                            {t.kotDone}
                          </button>
                        )}
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
