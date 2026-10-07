import { money } from '../../data/mock'
import { IconPay } from './QuickServeIcons'

type Props = {
  lineCount: number
  total: number
  pulse?: boolean
  canSettle: boolean
  dayIsClosed: boolean
  onViewTicket: () => void
  onSettle: () => void
}

export default function QuickServeMobileCart({
  lineCount,
  total,
  pulse,
  canSettle,
  dayIsClosed,
  onViewTicket,
  onSettle,
}: Props) {
  return (
    <div className={`qs-mobile-cart${pulse ? ' pulse' : ''}`} role="region" aria-label="Current ticket">
      <button type="button" className="qs-mobile-cart-main" onClick={onViewTicket}>
        <span className="qs-mobile-cart-count">
          {lineCount} {lineCount === 1 ? 'item' : 'items'}
        </span>
        <strong className="qs-mobile-cart-total">{money(total)}</strong>
        <span className="qs-mobile-cart-hint">View ticket</span>
      </button>
      {canSettle ? (
        <button
          type="button"
          className="qs-mobile-cart-settle"
          disabled={dayIsClosed}
          onClick={onSettle}
        >
          <IconPay />
          Settle
        </button>
      ) : null}
    </div>
  )

}
