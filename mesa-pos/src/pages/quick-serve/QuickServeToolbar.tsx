import { Link } from 'react-router-dom'
import { useI18n } from '../../locale/i18n'
import { IconBag, IconBolt, IconPlus } from './QuickServeIcons'

type Props = {
  serveNo: number
  statusLabel: string
  openCount: number
  dayIsClosed: boolean
  compact?: boolean
  onNewTicket: () => void
}

export default function QuickServeToolbar({
  serveNo,
  statusLabel,
  openCount,
  dayIsClosed,
  compact,
  onNewTicket,
}: Props) {
  const { t } = useI18n()

  return (
    <header className={`qs-toolbar${compact ? ' qs-toolbar-compact' : ''}`}>
      <div className="qs-toolbar-brand">
        <span className="qs-hero-mark">
          <IconBolt />
        </span>
        <div>
          {!compact ? <h1>{t.quickServe}</h1> : null}
          <p>
            #{serveNo || '—'} · {statusLabel}
            {dayIsClosed ? ' · day closed' : ''}
          </p>
        </div>
      </div>
      <div className="qs-toolbar-actions">
        {dayIsClosed ? <span className="qs-pill closed">Day closed</span> : null}
        {!compact ? (
          <>
            <a href="#qs-open-queue" className="qs-link-btn">
              {t.qsOpenOrdersLink}
              {openCount > 0 ? ` (${openCount})` : ''}
            </a>
            <Link to="/takeaway" className="qs-link-btn">
              <IconBag /> {t.tileTakeAway}
            </Link>
          </>
        ) : null}
        <button
          type="button"
          className="btn btn-primary qs-new-btn"
          disabled={dayIsClosed}
          onClick={onNewTicket}
          aria-label={t.qsNewTicket}
        >
          <IconPlus />
          {compact ? 'New' : t.qsNewTicket}
        </button>
      </div>
    </header>
  )
}
