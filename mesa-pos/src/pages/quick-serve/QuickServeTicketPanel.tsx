import type { RolePermissions } from '../../auth/roles'
import MesaSelect from '../../components/MesaSelect'
import QtyStepper from '../../components/QtyStepper'
import { money, type OpenTicket } from '../../data/mock'
import { SAUDI } from '../../locale/saudi'
import { guestLabelFromTicket } from './quickServeTickets'
import { useI18n } from '../../locale/i18n'
import { IconCancel, IconPay, IconSend, IconTrash, IconUser } from './QuickServeIcons'

type OrderTypeOpt = 'takeaway' | 'dine-in' | 'delivery'

type Props = {
  panelId?: string
  isTabPanel?: boolean
  serveNo: number
  status: { label: string; tone: 'muted' | 'amber' | 'teal' }
  selected: OpenTicket | undefined
  linkedCustomer?: { id: string; name: string }
  orderType: OrderTypeOpt
  onOrderTypeChange: (value: OrderTypeOpt) => void
  ticketNote: string
  lines: OpenTicket['lines']
  taxable: number
  tax: number
  total: number
  pending: number
  perms: RolePermissions
  dayIsClosed: boolean
  onChangeQty: (lineId: string, delta: number) => void
  onRemoveLine: (lineId: string, qty: number) => void
  onSend: () => void
  onSettle: () => void
  onRequestPay: () => void
  onCancel: () => void
}

export default function QuickServeTicketPanel({
  panelId,
  isTabPanel,
  serveNo,
  status,
  selected,
  linkedCustomer,
  orderType,
  onOrderTypeChange,
  ticketNote,
  lines,
  taxable,
  tax,
  total,
  pending,
  perms,
  dayIsClosed,
  onChangeQty,
  onRemoveLine,
  onSend,
  onSettle,
  onRequestPay,
  onCancel,
}: Props) {
  const { t } = useI18n()
  const guestLabel = selected ? guestLabelFromTicket(selected, t.qsWalkIn) : t.qsWalkIn

  return (
    <section className="qs-ticket-panel" id={panelId} role={isTabPanel ? 'tabpanel' : undefined}>
      <div className="qs-ticket-head">
        <div>
          <h2>
            #{serveNo || '—'} <em>Quick Serve</em>
          </h2>
          <div className="qs-tags">
            <span className={`qs-status-pill ${status.tone}`}>{status.label}</span>
            <span className="qs-chip guest">
              <IconUser /> {guestLabel}
            </span>
            {linkedCustomer && selected?.phone ? (
              <span className="qs-chip soft">{selected.phone}</span>
            ) : null}
          </div>
        </div>
        <label className="qs-type">
          Type
          <MesaSelect
            value={orderType}
            onChange={(v) => onOrderTypeChange(v as OrderTypeOpt)}
            options={[
              { value: 'takeaway', label: 'Takeaway' },
              { value: 'dine-in', label: 'Dine-in' },
              { value: 'delivery', label: 'Delivery' },
            ]}
          />
        </label>
      </div>

      {ticketNote ? <p className="qs-note">Note: {ticketNote}</p> : null}

      <div className="qs-lines">
        {lines.length === 0 ? (
          <div className="qs-empty inline">
            <strong>No items yet</strong>
            <span>Add products from the menu tab.</span>
          </div>
        ) : (
          lines.map((line) => {
            const locked = dayIsClosed || line.sent
            return (
              <article key={line.id} className={`qs-line${line.sent ? ' sent' : ''}`}>
                <div className="qs-line-main">
                  <div className="qs-line-top">
                    <h3 className="qs-line-name">{line.name}</h3>
                    <strong className="qs-line-total">{money(line.qty * line.price)}</strong>
                  </div>
                  <div className="qs-line-bottom">
                    <div className="qs-line-meta">
                      <span>{money(line.price)} each</span>
                      <span className={`qs-line-badge${line.sent ? ' sent' : ''}`}>
                        {line.sent ? 'Sent' : 'New'}
                      </span>
                      {line.note ? <span className="qs-line-note">{line.note}</span> : null}
                    </div>
                    <QtyStepper
                      className="qs-line-qty"
                      value={line.qty}
                      ariaLabel={line.name}
                      disabled={dayIsClosed}
                      minusDisabled={line.sent}
                      inputDisabled={line.sent}
                      onChange={(delta) => onChangeQty(line.id, delta)}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="qs-line-remove"
                  aria-label={`Remove ${line.name}`}
                  title="Remove item"
                  disabled={locked}
                  onClick={() => onRemoveLine(line.id, line.qty)}
                >
                  <IconTrash />
                </button>
              </article>
            )
          })
        )}
      </div>

      <div className="qs-totals">
        <div>
          <span>Subtotal</span>
          <span>{money(taxable)}</span>
        </div>
        <div>
          <span>{SAUDI.vatLabel}</span>
          <span>{money(tax)}</span>
        </div>
        <div className="grand">
          <span>Total</span>
          <span>{money(total)}</span>
        </div>
      </div>

      <div className="qs-ticket-actions">
        {perms.canSendOrders ? (
          <button type="button" className="btn btn-teal" disabled={dayIsClosed} onClick={onSend}>
            <IconSend /> Send orders{pending > 0 ? ` (${pending})` : ''}
          </button>
        ) : null}
        {perms.canSettle ? (
          <button
            type="button"
            className="btn btn-teal"
            disabled={lines.length === 0 || dayIsClosed}
            onClick={onSettle}
          >
            <IconPay /> Settle
          </button>
        ) : (
          <button type="button" className="btn btn-secondary" disabled={lines.length === 0} onClick={onRequestPay}>
            Request pay
          </button>
        )}
        <button type="button" className="btn btn-ghost qs-cancel-btn" onClick={onCancel}>
          <IconCancel /> Cancel ticket
        </button>
      </div>
    </section>
  )
}
