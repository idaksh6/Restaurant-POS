import { useI18n } from '../../locale/i18n'
import type { OpenTicket } from '../../data/mock'
import { IconPlus, IconTicket, IconTrash } from './QuickServeIcons'
import {
  formatTicketAmount,
  guestLabelFromTicket,
  quickServeOpenCount,
  serveNoFromTicket,
  sortQuickServeTickets,
  ticketStatus,
} from './quickServeTickets'

type Props = {
  tickets: OpenTicket[]
  selectedId: string | null
  dayIsClosed: boolean
  onSelect: (ticket: OpenTicket) => void
  onNew: () => void
  onRemove: (ticket: OpenTicket) => void
}

export default function QuickServeQueue({
  tickets,
  selectedId,
  dayIsClosed,
  onSelect,
  onNew,
  onRemove,
}: Props) {
  const { t } = useI18n()
  const queue = sortQuickServeTickets(tickets)
  const openCount = quickServeOpenCount(tickets)

  return (
    <section className="qs-rail-wrap" id="qs-open-queue" aria-label={t.qsOpenQueue}>
      <div className="qs-rail">
        <div className="qs-rail-head">
          <h2>
            <IconTicket /> {t.qsOpenQueue}
          </h2>
          <span className="qs-rail-count" title={t.qsOpenCountTitle}>
            {openCount}
          </span>
        </div>
        <div className="qs-rail-scroll">
          {queue.length === 0 ? (
            <div className="qs-rail-empty">{t.qsNoOpenOrders}</div>
          ) : (
            queue.map((ticket) => {
              const no = serveNoFromTicket(ticket)
              const st = ticketStatus(ticket)
              const active = ticket.id === selectedId
              const hasItems = ticket.lines.length > 0
              const guest = guestLabelFromTicket(ticket, t.qsWalkIn)
              return (
                <div
                  key={ticket.id}
                  className={`qs-rail-card${active ? ' selected' : ''}${!hasItems ? ' draft' : ''}`}
                >
                  <button
                    type="button"
                    className="qs-rail-card-main"
                    onClick={() => onSelect(ticket)}
                    title={`#${no || '—'} · ${guest}`}
                  >
                    <span className="qs-rail-no">#{no || '—'}</span>
                    <span className="qs-rail-copy">
                      <strong className="qs-rail-guest">{guest}</strong>
                      <span className="qs-rail-meta">
                        {hasItems ? `${ticket.lines.length} items` : t.qsEmptyDraft}
                        {' · '}
                        <em className={`qs-rail-status ${st.tone}`}>{st.label}</em>
                      </span>
                    </span>
                    {hasItems ? (
                      <span className="qs-rail-amt">{formatTicketAmount(ticket)}</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="qs-rail-remove"
                    disabled={dayIsClosed}
                    title={hasItems ? t.qsRemoveTicket : t.qsRemoveDraft}
                    aria-label={hasItems ? t.qsRemoveTicket : t.qsRemoveDraft}
                    onClick={() => onRemove(ticket)}
                  >
                    <IconTrash />
                    <span className="qs-rail-remove-tip" role="tooltip">
                      {t.qsRemove}
                    </span>
                  </button>
                </div>
              )
            })
          )}
          <button
            type="button"
            className="qs-rail-add"
            disabled={dayIsClosed}
            onClick={onNew}
            title={t.qsNewTicket}
          >
            <IconPlus />
            <span>{t.qsNewTicket}</span>
          </button>
        </div>
      </div>
    </section>
  )
}
