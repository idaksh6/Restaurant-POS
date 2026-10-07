import { Link } from 'react-router-dom'
import type { RolePermissions } from '../../auth/roles'
import { IconNote, IconPlus, IconSend, IconTable, IconUser } from './QuickServeIcons'

type Props = {
  perms: RolePermissions
  dayIsClosed: boolean
  pending: number
  linesCount: number
  compact?: boolean
  onCustomer: () => void
  onNote: () => void
  onNewTicket: () => void
  onSend: () => void
  onTempBill: () => void
}

export default function QuickServeTools({
  perms,
  dayIsClosed,
  pending,
  linesCount,
  compact,
  onCustomer,
  onNote,
  onNewTicket,
  onSend,
  onTempBill,
}: Props) {
  return (
    <nav className={`qs-tools${compact ? ' qs-tools-compact' : ''}`} aria-label="Quick actions">
      <Link to="/dine-in" className="qs-tool" title="Tables" aria-label="Tables">
        <IconTable />
        <span className="qs-tool-label">Table</span>
      </Link>
      <button type="button" className="qs-tool" title="Customer" aria-label="Customer" onClick={onCustomer}>
        <IconUser />
        <span className="qs-tool-label">Customer</span>
      </button>
      <button type="button" className="qs-tool" title="Note" aria-label="Note" onClick={onNote}>
        <IconNote />
        <span className="qs-tool-label">Note</span>
      </button>
      <button
        type="button"
        className="qs-tool"
        title="New ticket"
        aria-label="New ticket"
        disabled={dayIsClosed}
        onClick={onNewTicket}
      >
        <IconPlus />
        <span className="qs-tool-label">New</span>
      </button>
      {perms.canSendOrders ? (
        <button
          type="button"
          className="qs-tool accent"
          title="Send orders"
          aria-label={`Send orders${pending > 0 ? ` (${pending})` : ''}`}
          disabled={dayIsClosed}
          onClick={onSend}
        >
          <IconSend />
          <span className="qs-tool-label">
            Send{pending > 0 ? ` (${pending})` : ''}
          </span>
        </button>
      ) : null}
      <Link to="/delivery" className="qs-tool" title="Delivery" aria-label="Delivery">
        <span className="qs-tool-label">Delivery</span>
      </Link>
      <button
        type="button"
        className="qs-tool"
        title="Temp bill"
        aria-label="Temp bill"
        disabled={linesCount === 0}
        onClick={onTempBill}
      >
        <span className="qs-tool-label">Temp bill</span>
      </button>
    </nav>
  )
}
