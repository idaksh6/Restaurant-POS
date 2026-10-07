import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { findGuestToken } from '../data/guestOrder'
import { money, type OrderLine } from '../data/mock'
import { peekCategories, peekDishes } from '../data/repos/mastersRepo'
import { getApiBaseUrl } from '../lib/apiBase'
import { useI18n } from '../locale/i18n'
import { usePos } from '../state/PosContext'

type MenuDish = {
  id: string
  name: string
  alias?: string | null
  price: number
  categoryId?: string
  category?: string
  active?: boolean
}
type MenuCat = { id: string; name: string; parentId?: string | null; active?: boolean }
type CartLine = OrderLine

async function fetchPublicMenu(branchId: string, companyId?: string) {
  const base = getApiBaseUrl() || 'https://api.restaurant-pos.isarva.in'
  const q = new URLSearchParams({ branchId })
  if (companyId) q.set('companyId', companyId)
  const res = await fetch(`${base}/public/menu?${q}`)
  if (!res.ok) throw new Error(`Menu ${res.status}`)
  return res.json() as Promise<{ products: MenuDish[]; categories: MenuCat[] }>
}

async function postPublicOrder(payload: Record<string, unknown>) {
  const base = getApiBaseUrl() || 'https://api.restaurant-pos.isarva.in'
  const res = await fetch(`${base}/public/guest-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(text.slice(0, 180) || `Order ${res.status}`)
  try {
    return JSON.parse(text) as { id?: string }
  } catch {
    return { id: undefined }
  }
}

export default function GuestMenuPage() {
  const { t, lang } = useI18n()
  const { token = '' } = useParams()
  const [searchParams] = useSearchParams()
  const { addTicket, flash } = usePos()

  const mapped = findGuestToken(token)
  const branchId = mapped?.branchId || (token.startsWith('b-') ? token.slice(2) : token)
  const tableId = mapped?.tableId || searchParams.get('table') || undefined
  const companyId = searchParams.get('co') || undefined

  const [dishes, setDishes] = useState<MenuDish[]>([])
  const [categories, setCategories] = useState<MenuCat[]>([])
  const [loadErr, setLoadErr] = useState('')
  const [catId, setCatId] = useState<string>('all')
  const [cart, setCart] = useState<CartLine[]>([])
  const [name, setName] = useState('Guest')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [doneId, setDoneId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!branchId) {
        setLoadErr(t.guestInvalidLink)
        return
      }
      try {
        const remote = await fetchPublicMenu(branchId, companyId)
        if (cancelled) return
        setDishes((remote.products ?? []).filter((d) => d.active !== false))
        setCategories((remote.categories ?? []).filter((c) => c.active !== false))
        setLoadErr('')
      } catch {
        if (cancelled) return
        const localDishes = peekDishes().filter((d) => d.active !== false)
        const localCats = peekCategories().filter((c) => c.active !== false)
        setDishes(localDishes)
        setCategories(localCats)
        setLoadErr(localDishes.length ? t.guestMenuOfflineLocal : t.guestMenuUnavailable)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [branchId, companyId, t.guestInvalidLink, t.guestMenuOfflineLocal, t.guestMenuUnavailable])

  const filtered = useMemo(() => {
    if (catId === 'all') return dishes.slice(0, 80)
    return dishes.filter((d) => d.categoryId === catId).slice(0, 80)
  }, [dishes, catId])

  const total = cart.reduce((s, l) => s + l.price * l.qty, 0)

  function addDish(id: string) {
    const dish = dishes.find((d) => d.id === id)
    if (!dish) return
    setCart((prev) => {
      const hit = prev.find((l) => l.itemId === dish.id)
      if (hit) return prev.map((l) => (l.itemId === dish.id ? { ...l, qty: l.qty + 1 } : l))
      return [
        ...prev,
        {
          id: `gl-${Date.now()}-${dish.id}`,
          itemId: dish.id,
          name: dish.name,
          nameAr: dish.alias?.trim() || undefined,
          qty: 1,
          price: Number(dish.price) || 0,
        },
      ]
    })
  }

  async function submit() {
    if (!branchId) return
    if (!cart.length) {
      flash(t.guestAddItems, 'err')
      return
    }
    setBusy(true)
    try {
      const remote = await postPublicOrder({
        companyId,
        branchId,
        tableId,
        customer: name.trim() || 'QR guest',
        phone: phone.trim() || undefined,
        note: note.trim() || undefined,
        lines: cart.map((l) => ({
          itemId: l.itemId,
          name: l.name,
          qty: l.qty,
          price: l.price,
        })),
      })
      setDoneId(remote.id ?? `qr-${Date.now()}`)
      setCart([])
      flash(t.guestSentOk)
    } catch {
      const id = `qr-local-${Date.now()}`
      addTicket({
        id,
        type: 'online',
        customer: name.trim() || 'QR guest',
        phone: phone.trim() || undefined,
        openedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        lines: cart.map((l) => ({ ...l, sent: false })),
        checkStatus: 'open',
        branchId,
        amount: total,
        channel: 'QR',
        tableId,
        note: note.trim() || undefined,
        kitchenStatus: 'queued',
        channelAcceptStatus: 'pending',
      })
      setDoneId(id)
      setCart([])
      flash(t.guestSavedLocal)
    } finally {
      setBusy(false)
    }
  }

  if (!branchId) {
    return (
      <div className="zk-guest">
        <div className="zk-guest-shell zk-guest-center">
          <h1>{t.guestInvalidLink}</h1>
          <p>{t.guestAskStaff}</p>
          <Link className="btn btn-teal" to="/">
            {t.guestStaffLogin}
          </Link>
        </div>
      </div>
    )
  }

  if (doneId) {
    return (
      <div className="zk-guest">
        <div className="zk-guest-shell zk-guest-center">
          <h1>{t.guestOrderReceived}</h1>
          <p>{t.guestOrderRef.replace('{ref}', doneId.slice(-8))}</p>
          <button type="button" className="btn btn-teal" onClick={() => setDoneId(null)}>
            {t.guestOrderAgain}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="zk-guest">
      <div className="zk-guest-shell">
        <header className="zk-guest-hero">
          <span className="zk-guest-mark" aria-hidden>
            M
          </span>
          <div>
            <h1>{t.guestOrderTitle}</h1>
            <p>
              {tableId
                ? t.guestTableOrder.replace('{table}', tableId)
                : t.guestQrTakeaway}
            </p>
            {loadErr ? <p className="zk-guest-warn">{loadErr}</p> : null}
          </div>
        </header>

        <div className="zk-guest-cats">
          <button
            type="button"
            className={`btn ${catId === 'all' ? 'btn-teal' : 'btn-ghost'}`}
            onClick={() => setCatId('all')}
          >
            {t.all}
          </button>
          {categories
            .filter((c) => !c.parentId)
            .slice(0, 12)
            .map((c) => (
              <button
                key={c.id}
                type="button"
                className={`btn ${catId === c.id ? 'btn-teal' : 'btn-ghost'}`}
                onClick={() => setCatId(c.id)}
              >
                {c.name}
              </button>
            ))}
        </div>

        <div className="zk-guest-menu">
          {filtered.map((d) => (
            <button key={d.id} type="button" className="zk-guest-item" onClick={() => addDish(d.id)}>
              <span>{d.name}</span>
              <strong className="mesa-ltr-nums">{money(Number(d.price) || 0, lang)}</strong>
            </button>
          ))}
        </div>

        <section className="zk-guest-cart">
          <h2>
            {t.guestCart} · <span className="mesa-ltr-nums">{money(total, lang)}</span>
          </h2>
          {cart.length === 0 ? (
            <p>{t.guestAddItems}</p>
          ) : (
            <ul>
              {cart.map((l) => (
                <li key={l.id}>
                  <span className="mesa-ltr-nums">{l.qty}×</span> {l.name}
                </li>
              ))}
            </ul>
          )}
          <label className="zk-guest-field">
            {t.guestName}
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
          <label className="zk-guest-field">
            {t.guestPhone}
            <input
              className="mesa-ltr-nums"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
            />
          </label>
          <label className="zk-guest-field">
            {t.guestNote}
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button
            type="button"
            className="btn btn-teal zk-guest-submit"
            onClick={() => void submit()}
            disabled={!cart.length || busy}
          >
            {busy ? t.guestSending : t.guestPlaceOrder}
          </button>
        </section>
      </div>
    </div>
  )
}
