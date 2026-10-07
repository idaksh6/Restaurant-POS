import TableIcon from './TableIcon'
import { money, type Table } from '../data/mock'
import { localizedAreaName } from '../lib/branding'
import { useI18n } from '../locale/i18n'

type Props = {
  table: Table
  itemCount: number
  selected: boolean
  canClearEmpty: boolean
  statusLabel: string
  onSelect: () => void
  onClearEmpty: (e: React.SyntheticEvent) => void
  showArea?: boolean
}

function GuestsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="currentColor">
      <path d="M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13Zm8 0c-.29 0-.62.02-.97.05A4.74 4.74 0 0 1 18 16.5V19h6v-2.5c0-2.33-4.67-3.5-8-3.5Z" />
    </svg>
  )
}

function CoinsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="currentColor">
      <path d="M12 2C7.58 2 4 3.79 4 6v12c0 2.21 3.58 4 8 4s8-1.79 8-4V6c0-2.21-3.58-4-8-4Zm0 2c3.31 0 6 1.12 6 2.5S15.31 9 12 9 6 7.88 6 6.5 8.69 4 12 4Zm0 16c-3.31 0-6-1.12-6-2.5V15.4c1.55.95 3.66 1.5 6 1.5s4.45-.55 6-1.5v2.1C18 18.88 15.31 20 12 20Zm0-5.5c-3.31 0-6-1.12-6-2.5v-1.1c1.55.95 3.66 1.5 6 1.5s4.45-.55 6-1.5V12c0 1.38-2.69 2.5-6 2.5Z" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden fill="currentColor">
      <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 14.5 9 2.5 2.5 0 0 1 12 11.5Z" />
    </svg>
  )
}

function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden fill="currentColor">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 2.5L17.5 8H14ZM8 12h8v1.5H8Zm0 3.5h8V17H8Zm0-7h4V10H8Z" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export default function DineTableTile({
  table,
  itemCount,
  selected,
  canClearEmpty,
  statusLabel,
  onSelect,
  onClearEmpty,
  showArea = true,
}: Props) {
  const { t, lang } = useI18n()
  const isActive = table.status !== 'free'
  const mergeCount = table.mergedFromLabels?.length ?? 0
  const guests = table.guests ?? (isActive ? table.seats : 0)
  const amount =
    typeof table.amount === 'number' ? money(table.amount, lang) : money(0, lang)

  const statusDetail =
    table.status === 'billing'
      ? t.diBillingInProgress
      : table.status === 'reserved'
        ? t.tableReserved
        : null

  const leftTitle = (() => {
    if (table.status === 'merged') return `→ T${table.mergedIntoLabel ?? '—'}`
    if (mergeCount > 0) return t.diAddTable
    if (isActive) return `${guests} ${t.guests}`
    return `${table.seats} ${t.covers}`
  })()

  const leftHint = (() => {
    if (table.status === 'merged') return t.tableMerged
    if (mergeCount > 0) return t.diMergeWithAnother
    if (isActive) return t.diCurrentlySeated
    return t.tapToSeat
  })()

  const showAddStyle = mergeCount > 0 && table.status !== 'merged'

  const ctaLabel = isActive
    ? table.status === 'merged'
      ? t.tableMerged
      : t.diViewTableDetails
    : t.tapToSeat

  const mergePill =
    mergeCount > 0
      ? `${t.tableMerged} +${mergeCount}`
      : table.status === 'merged'
        ? `${t.tableMerged} → T${table.mergedIntoLabel ?? '—'}`
        : null

  const mergeTip =
    mergeCount > 0
      ? table.mergedFromLabels!.map((l) => `T${l}`).join(' · ')
      : table.status === 'merged' && table.mergedIntoLabel
        ? `T${table.mergedIntoLabel}`
        : null

  const showPills = Boolean(statusDetail || mergePill)

  return (
    <button
      type="button"
      className={`table-tile dine-table-tile dine-table-card ${table.status}${
        mergeCount ? ' has-merge' : ''
      }${selected ? ' selected' : ''}${canClearEmpty ? ' can-clear' : ''}`}
      onClick={onSelect}
    >
      <div className={`dine-tc-hero status-${table.status}`}>
        <span className="dine-tc-hero-icon" aria-hidden>
          <TableIcon seats={table.seats} busy={isActive && table.status !== 'merged'} />
        </span>
        <span className={`dine-tc-chip ${table.status}`}>
          <span className="dine-tc-chip-ico" aria-hidden>
            {table.status === 'billing' ? <DocIcon /> : <GuestsIcon />}
          </span>
          {statusLabel}
        </span>
      </div>

      <div className="dine-tc-body">
        <div className="dine-tc-identity">
          <strong className="dine-tc-title">
            {t.diTableName.replace('{n}', table.label)}
          </strong>
          {showArea ? (
            <span className="dine-tc-area">
              <PinIcon />
              {localizedAreaName(table.area, lang)}
            </span>
          ) : (
            <span className="dine-tc-area muted">
              T{table.label}-{table.seats}
            </span>
          )}
        </div>

        {showPills ? (
          <div className="dine-tc-pills">
            {statusDetail ? (
              <span className={`dine-tc-pill ${table.status}`}>
                <span aria-hidden>
                  {table.status === 'billing' ? <DocIcon /> : <GuestsIcon />}
                </span>
                {statusDetail}
              </span>
            ) : null}
            {mergePill ? (
              <span className={`dine-tc-pill merged${mergeTip ? ' has-tip' : ''}`}>
                <span aria-hidden>
                  <GuestsIcon />
                </span>
                {mergePill}
                {mergeTip ? (
                  <span className="dine-tc-tip" role="tooltip">
                    {mergeTip}
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="dine-tc-stats">
          <div className={`dine-tc-stat${showAddStyle ? ' add' : ''}`}>
            <span className={`dine-tc-stat-ico${showAddStyle ? ' plus' : ''}`} aria-hidden>
              {showAddStyle ? <PlusIcon /> : <GuestsIcon />}
            </span>
            <div className="dine-tc-stat-copy">
              <strong className={showAddStyle ? 'accent' : undefined}>{leftTitle}</strong>
              <small>{leftHint}</small>
            </div>
          </div>
          <div className="dine-tc-stat">
            <span className="dine-tc-stat-ico muted" aria-hidden>
              <CoinsIcon />
            </span>
            <div className="dine-tc-stat-copy">
              <small>{t.diTotalAmount}</small>
              {canClearEmpty ? (
                <span
                  role="button"
                  tabIndex={0}
                  className="dine-clear-empty"
                  title={t.diClearEmptyTitle}
                  onClick={onClearEmpty}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onClearEmpty(e)
                    }
                  }}
                >
                  {t.diRemove}
                </span>
              ) : (
                <strong className="mesa-ltr-nums">
                  {isActive ? amount : money(0, lang)}
                </strong>
              )}
            </div>
          </div>
        </div>

        {isActive && itemCount > 0 && table.status !== 'merged' ? (
          <span className="dine-tc-items mesa-ltr-nums">
            {itemCount} {itemCount === 1 ? t.itemOne : t.itemMany}
          </span>
        ) : null}

        <span className="dine-tc-cta">
          <span>{ctaLabel}</span>
          <span className="dine-tc-cta-chevron" aria-hidden>
            ›
          </span>
        </span>
      </div>
    </button>
  )
}
