import { Link } from 'react-router-dom'
import { money } from '../../data/mock'
import type { OrderKind, OrderStatus, RecentOrder } from '../../lib/dashboardData'
import { localeTag, useI18n, type I18nKey } from '../../locale/i18n'

const kindKey: Record<OrderKind, I18nKey> = {
  'dine-in': 'tileDineIn',
  takeaway: 'tileTakeAway',
  delivery: 'tileDelivery',
  online: 'tileOnline',
  quick: 'tileQuickServe',
  drive: 'tileDriveThru',
  barcode: 'tileBarcode',
}

const statusKey: Record<OrderStatus, I18nKey> = {
  completed: 'dashStatusCompleted',
  kitchen: 'dashStatusKitchen',
  preparing: 'dashStatusPreparing',
  ready: 'dashStatusReady',
  billing: 'dashStatusBilling',
  open: 'dashStatusOpen',
  onTheWay: 'dashStatusOnTheWay',
}

export default function RecentOrdersCard({
  orders,
  loading,
  viewAllTo,
}: {
  orders: RecentOrder[]
  loading: boolean
  viewAllTo?: string
}) {
  const { t, lang } = useI18n()

  return (
    <section className="hd-card hd-orders" aria-labelledby="hd-orders-title">
      <header className="hd-card-head">
        <h2 id="hd-orders-title">{t.dashRecentOrders}</h2>
        {viewAllTo ? (
          <Link to={viewAllTo} className="hd-link">
            {t.dashViewAll}
          </Link>
        ) : null}
      </header>

      {loading ? (
        <ul className="hd-orders-list" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="hd-skel-row">
              <span className="hd-skel" style={{ width: '38%' }} />
              <span className="hd-skel" style={{ width: '22%' }} />
            </li>
          ))}
        </ul>
      ) : orders.length === 0 ? (
        <p className="hd-empty">{t.dashNoOrders}</p>
      ) : (
        <ul className="hd-orders-list">
          {orders.map((order) => (
            <li key={order.id}>
              <Link to={order.to} className="hd-order">
                <span className="hd-order-id">
                  <strong className="mesa-ltr-nums">{order.ref}</strong>
                  <small>
                    {t[kindKey[order.kind]]}
                    {order.tableLabel ? ` · ${order.tableLabel}` : ''}
                  </small>
                </span>
                <span className="hd-order-time mesa-ltr-nums">
                  {new Date(order.at).toLocaleTimeString(localeTag(lang), { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="hd-order-amt mesa-ltr-nums">{money(order.amount)}</span>
                <span className={`hd-status is-${order.status}`}>{t[statusKey[order.status]]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
