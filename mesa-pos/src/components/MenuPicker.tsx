import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { money } from '../data/mock'
import { filterByActiveTimetables } from '../data/menuTimetable'
import type { MasterDish, MenuItem } from '../data/masters'
import { menuDisplayPrice } from '../data/masters'
import { localizedName } from '../lib/branding'
import { useI18n } from '../locale/i18n'
import { useMasters } from '../state/MastersContext'
import { useCatalog } from '../state/CatalogContext'
import { usePos } from '../state/PosContext'
import CustomizerModal from './CustomizerModal'
import { ITEM_NOTE_SUGGESTIONS } from '../data/itemNotes'

const RECENT_KEY = 'mesa-recent-items'

type Props = {
  onAdd: (item: MenuItem, note?: string) => void
}

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function MenuPicker({ onAdd }: Props) {
  const { lang, t } = useI18n()
  const { flash } = usePos()
  const { categories, activeDishes } = useMasters()
  const { timetables } = useCatalog()

  // Split into mains vs subs
  const mainCats = useMemo(
    () => categories.filter((c) => c.active && !c.parentId).sort((a, b) => a.sort - b.sort),
    [categories],
  )
  const subCats = useMemo(
    () => categories.filter((c) => c.active && !!c.parentId).sort((a, b) => a.sort - b.sort),
    [categories],
  )

  const [selectedMain, setSelectedMain] = useState<string>(() => mainCats[0]?.id ?? '')
  const [selectedSub, setSelectedSub]   = useState<string>('__all__')
  const [query, setQuery]               = useState('')
  const [code, setCode]                 = useState('')
  const [codeMsg, setCodeMsg]           = useState('')
  const [recentIds, setRecentIds]       = useState<string[]>(loadRecent)
  const [noteItem, setNoteItem]         = useState<MasterDish | null>(null)
  const [customItem, setCustomItem]     = useState<MasterDish | null>(null)
  const [note, setNote]                 = useState('')
  const [clockTick, setClockTick]       = useState(() => Date.now())
  const codeRef = useRef<HTMLInputElement>(null)
  const itemsRef = useRef<HTMLDivElement>(null)
  const itemsScrollRef = useRef(0)

  // Re-evaluate menu schedules as the clock crosses time windows.
  useEffect(() => {
    const id = window.setInterval(() => setClockTick(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  // Restore scroll only when the visible item list changes — not on every parent re-render
  // (ticket tax/totals updates must not flash the menu).
  useLayoutEffect(() => {
    const el = itemsRef.current
    if (el) el.scrollTop = itemsScrollRef.current
  }, [selectedMain, selectedSub, query, activeDishes])

  // When main changes, reset sub to __all__
  useEffect(() => { setSelectedSub('__all__') }, [selectedMain])
  // If mainCats load late, pick first
  useEffect(() => {
    if (!selectedMain && mainCats.length) setSelectedMain(mainCats[0].id)
  }, [mainCats, selectedMain])

  const timetable = useMemo(
    () => filterByActiveTimetables([], [], timetables, new Date(clockTick)),
    [timetables, clockTick],
  )

  const timetableDishes = useMemo(() => {
    if (!timetable.restricted) return activeDishes
    const prodSet = new Set(timetable.productIds)
    const catSet = new Set(timetable.categoryIds)
    return activeDishes.filter((item) => {
      if (prodSet.size && prodSet.has(item.id)) return true
      if (!catSet.size) return false
      const sub = subCats.find((s) => s.id === item.categoryId)
      return (
        catSet.has(item.categoryId) ||
        (sub?.parentId ? catSet.has(sub.parentId) : false) ||
        (sub ? catSet.has(sub.id) : false)
      )
    })
  }, [activeDishes, subCats, timetable])

  const visibleMainCats = useMemo(() => {
    if (!timetable.restricted) return mainCats
    return mainCats.filter((main) =>
      timetableDishes.some((item) => {
        if (item.categoryId === main.id) return true
        const sub = subCats.find((s) => s.id === item.categoryId)
        return sub?.parentId === main.id
      }),
    )
  }, [mainCats, subCats, timetable.restricted, timetableDishes])

  // Keep selection valid when timetable hides the current main.
  useEffect(() => {
    if (selectedMain === '__fav__' || selectedMain === '__recent__') return
    if (!visibleMainCats.length) return
    if (!visibleMainCats.some((c) => c.id === selectedMain)) {
      setSelectedMain(visibleMainCats[0].id)
    }
  }, [visibleMainCats, selectedMain])

  function underSelectedMain(item: (typeof activeDishes)[number]) {
    if (item.categoryId === selectedMain) return true
    const sub = subCats.find((s) => s.id === item.categoryId)
    return sub?.parentId === selectedMain
  }

  function matchesQuery(item: MasterDish) {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      item.name.toLowerCase().includes(q) ||
      (item.alias ?? '').toLowerCase().includes(q) ||
      item.code.includes(q) ||
      item.category.toLowerCase().includes(q)
    )
  }

  const favoriteItems = useMemo(
    () => timetableDishes.filter((item) => item.popular && matchesQuery(item)),
    [timetableDishes, query],
  )

  const recentItems = useMemo(() => {
    const byId = new Map(timetableDishes.map((item) => [item.id, item]))
    return recentIds
      .map((id) => byId.get(id))
      .filter((item): item is MasterDish => {
        if (!item) return false
        return matchesQuery(item)
      })
  }, [timetableDishes, recentIds, query])

  const filtered = useMemo(() => {
    const q = query.trim()
    // Typed search is global — ignore Favorite / Recent / category tabs.
    if (q) return timetableDishes.filter((item) => matchesQuery(item))
    if (selectedMain === '__fav__') return favoriteItems
    if (selectedMain === '__recent__') return recentItems
    return timetableDishes.filter((item) => {
      if (!underSelectedMain(item)) return false
      if (selectedSub !== '__all__' && item.categoryId !== selectedSub) return false
      return true
    })
  }, [timetableDishes, selectedMain, selectedSub, query, favoriteItems, recentItems])

  // sub-cat counts
  const subCounts = useMemo(() => {
    const map: Record<string, number> = { __all__: 0 }
    for (const item of timetableDishes) {
      if (!underSelectedMain(item)) continue
      map.__all__ = (map.__all__ ?? 0) + 1
      map[item.categoryId] = (map[item.categoryId] ?? 0) + 1
    }
    return map
  }, [timetableDishes, subCats, selectedMain])

  function remember(item: MasterDish) {
    setRecentIds((prev) => {
      const next = [item.id, ...prev.filter((id) => id !== item.id)].slice(0, 12)
      localStorage.setItem(RECENT_KEY, JSON.stringify(next))
      return next
    })
  }

  function confirmAdd(item: MasterDish, itemNote?: string) {
    remember(item)
    onAdd(item, itemNote)
    flash(`${localizedName(item, lang)} · ${t.itemAdded}`, 'ok', 1400)
  }

  function tryAdd(item: MasterDish, itemNote?: string) {
    if (item.customizer) {
      setCustomItem(item)
      return
    }
    confirmAdd(item, itemNote)
  }

  function submitCode() {
    const value = code.trim()
    if (!value) return
    const found = activeDishes.find(
      (item) => item.code === value || item.code === value.replace(/^0+/, ''),
    )
    if (!found) {
      const msg = t.pluNotFound.replace('{code}', value)
      setCodeMsg(msg)
      flash(msg, 'err')
      return
    }
    if (found.customizer) {
      setCustomItem(found)
      setCodeMsg(t.openItemOptions.replace('{name}', localizedName(found, lang)))
    } else {
      confirmAdd(found)
      setCodeMsg(t.itemAdded)
    }
    setCode('')
    codeRef.current?.focus()
  }

  useEffect(() => {
    if (!codeMsg) return
    const t = window.setTimeout(() => setCodeMsg(''), 1600)
    return () => window.clearTimeout(t)
  }, [codeMsg])

  // Group filtered items by sub-category for display (only when __all__ selected)
  const grouped = useMemo(() => {
    if (selectedMain === '__fav__' || selectedMain === '__recent__') return null
    if (selectedSub !== '__all__') return null
    const map = new Map<string, MasterDish[]>()
    for (const item of filtered) {
      const arr = map.get(item.categoryId) ?? []
      arr.push(item)
      map.set(item.categoryId, arr)
    }
    return map
  }, [filtered, selectedSub, selectedMain])

  return (
    <div className="mp-root">
      {/* ── top toolbar ── */}
      <div className="mp-toolbar">
        <label className="mp-search-field">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
            <path d="M16.5 16.5 20 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            className="search"
            placeholder={t.searchMenu}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t.searchMenu}
          />
        </label>
        <div className="mp-code-row">
          <label className="mp-plu-field">
            <span>{t.mpPlu}</span>
            <input
              ref={codeRef}
              className="search code-input"
              placeholder={t.mpPluPlaceholder}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={(e) => { if (e.key === 'Enter') submitCode() }}
              aria-label={t.quickCode}
            />
          </label>
          <button type="button" className="btn btn-teal mp-add-code" onClick={submitCode}>
            {t.mpAdd}
          </button>
          {codeMsg ? <span className="code-msg">{codeMsg}</span> : null}
        </div>
      </div>

      <div className="mp-body">
        <nav className="mp-nav" aria-label="Menu categories">
          <button
            type="button"
            className={`mp-main-btn${selectedMain === '__fav__' ? ' active' : ''}`}
            onClick={() => setSelectedMain('__fav__')}
          >
            <CatGlyph name="favorite" />
            <span>{t.mpFavorite}</span>
            {favoriteItems.length ? <span className="mp-sub-count">{favoriteItems.length}</span> : null}
          </button>
          <button
            type="button"
            className={`mp-main-btn${selectedMain === '__recent__' ? ' active' : ''}`}
            onClick={() => setSelectedMain('__recent__')}
          >
            <CatGlyph name="recent" />
            <span>{t.mpRecent}</span>
            {recentItems.length ? <span className="mp-sub-count">{recentItems.length}</span> : null}
          </button>
          <div className="mp-nav-split" aria-hidden />
          {visibleMainCats.map((mc) => {
            const open = selectedMain === mc.id
            // "All" is reserved for the synthetic __all__ filter — never list a real category with that name
            const kids = subCats.filter(
              (s) =>
                s.parentId === mc.id &&
                s.name.trim().toLowerCase() !== 'all' &&
                localizedName(s, lang).trim().toLowerCase() !== 'all' &&
                (!timetable.restricted || (subCounts[s.id] ?? 0) > 0),
            )
            return (
              <div key={mc.id} className={`mp-nav-block${open ? ' open' : ''}`}>
                <button
                  type="button"
                  className={`mp-main-btn${open ? ' active' : ''}`}
                  onClick={() => setSelectedMain(mc.id)}
                >
                  <CatGlyph name={mc.name} />
                  <span>{localizedName(mc, lang)}</span>
                </button>
                {open && kids.length > 0 ? (
                  <div className="mp-nav-subs">
                    <button
                      type="button"
                      className={`mp-sub-btn${selectedSub === '__all__' ? ' active' : ''}`}
                      onClick={() => setSelectedSub('__all__')}
                    >
                      <span className="mp-sub-name">{t.mpAll}</span>
                      {subCounts.__all__ ? <span className="mp-sub-count">{subCounts.__all__}</span> : null}
                    </button>
                    {kids.map((sc) => (
                      <button
                        key={sc.id}
                        type="button"
                        className={`mp-sub-btn${selectedSub === sc.id ? ' active' : ''}`}
                        onClick={() => setSelectedSub(sc.id)}
                      >
                        <span className="mp-sub-name">{localizedName(sc, lang)}</span>
                        {subCounts[sc.id] ? <span className="mp-sub-count">{subCounts[sc.id]}</span> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
        </nav>

        {/* col 3: items */}
        <div
          className="mp-items"
          ref={itemsRef}
          onScroll={(e) => {
            itemsScrollRef.current = e.currentTarget.scrollTop
          }}
        >
          {filtered.length === 0 ? (
            <div className="ticket-empty">
              <strong>
                {selectedMain === '__fav__'
                  ? t.mpNoFavorites
                  : selectedMain === '__recent__'
                    ? t.mpNoRecent
                    : t.mpNoItems}
              </strong>
              {selectedMain === '__fav__'
                ? t.mpFavHint
                : selectedMain === '__recent__'
                  ? t.mpRecentHint
                  : t.mpMastersHint}
            </div>
          ) : grouped ? (
            // grouped by sub-cat
            Array.from(grouped.entries()).map(([catId, items]) => {
              const sub = subCats.find((s) => s.id === catId)
              const main = mainCats.find((m) => m.id === catId)
              return (
                <div key={catId} className="mp-group">
                  <div className="mp-group-label">
                    {localizedName(sub ?? main ?? { name: catId }, lang)}
                  </div>
                  <div className="mp-grid">
                    {items.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        lang={lang}
                        onAdd={tryAdd}
                        onCustomize={setCustomItem}
                        onNote={(it) => {
                          setNoteItem(it)
                          setNote('')
                        }}
                      />
                    ))}
                  </div>
                </div>
              )
            })
          ) : (
            <div className="mp-grid">
              {filtered.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  lang={lang}
                  onAdd={tryAdd}
                  onCustomize={setCustomItem}
                  onNote={(it) => {
                    setNoteItem(it)
                    setNote('')
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── customizer modal ── */}
      {customItem ? (
        <CustomizerModal
          dish={customItem}
          onClose={() => setCustomItem(null)}
          onSave={({ name, price, note: customNote }) => {
            confirmAdd({ ...customItem, name, price }, customNote)
            setCustomItem(null)
          }}
        />
      ) : null}

      {/* ── note modal ── */}
      {noteItem ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="section-head">
              <h2>Note · {noteItem.name} <span className="chip">{noteItem.code}</span></h2>
              <button type="button" className="btn btn-ghost" onClick={() => setNoteItem(null)}>Close</button>
            </div>
            <input
              className="search"
              placeholder="e.g. no onion, allergy…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="menu-tabs mp-note-chips" role="group" aria-label="Note suggestions">
              {ITEM_NOTE_SUGGESTIONS.map((n) => {
                const parts = note
                  .split(',')
                  .map((p) => p.trim())
                  .filter(Boolean)
                const active = parts.some((p) => p.toLowerCase() === n.toLowerCase())
                return (
                  <button
                    key={n}
                    type="button"
                    className={active ? 'active' : ''}
                    aria-pressed={active}
                    onClick={() => {
                      if (!note.trim()) {
                        setNote(n)
                        return
                      }
                      if (active) {
                        setNote(
                          parts
                            .filter((p) => p.toLowerCase() !== n.toLowerCase())
                            .join(', '),
                        )
                        return
                      }
                      setNote(`${note.trim()}, ${n}`)
                    }}
                  >
                    {n}
                  </button>
                )
              })}
            </div>
            <div className="action-row">
              <button type="button" className="btn btn-ghost" onClick={() => { tryAdd(noteItem); setNoteItem(null); setNote('') }}>{t.mpAddPlain}</button>
              <button type="button" className="btn btn-primary" onClick={() => { tryAdd(noteItem, note.trim() || undefined); setNoteItem(null); setNote('') }}>{t.mpAddWithNote}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default memo(MenuPicker)

function CatGlyph({ name }: { name: string }) {
  const n = name.toLowerCase()
  if (n === 'favorite' || n.includes('favour')) {
    return (
      <svg className="mp-cat-ico" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 4.8 13.9 9l4.6.4-3.5 3 1.1 4.5L12 14.7 7.9 16.9 9 12.4 5.5 9.4 10.1 9 12 4.8Z"
          fill="currentColor"
        />
      </svg>
    )
  }
  if (n === 'recent') {
    return (
      <svg className="mp-cat-ico" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 8v4.2L15 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }
  if (n.includes('pizza')) {
    return (
      <svg className="mp-cat-ico" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M3 8c6-4 12-4 18 0-3 8-7 12-9 12S6 16 3 8Z" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="10" cy="11" r="1.2" fill="currentColor" />
        <circle cx="14" cy="13" r="1.2" fill="currentColor" />
        <circle cx="12" cy="9.5" r="1" fill="currentColor" />
      </svg>
    )
  }
  if (n.includes('bever') || n.includes('drink')) {
    return (
      <svg className="mp-cat-ico" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M7 4h10l-1.2 14.2A2 2 0 0 1 13.8 20h-3.6a2 2 0 0 1-2-1.8L7 4Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 8h8" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    )
  }
  if (n.includes('dessert') || n.includes('sweet') || n.includes('cake')) {
    return (
      <svg className="mp-cat-ico" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 13h16v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M5 13c1.5-4 4-6 7-6s5.5 2 7 6" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 4v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg className="mp-cat-ico" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M8 3v8M6 3v5a2 2 0 0 0 4 0V3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16 3c2 2 2 5 0 7v11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 11v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ItemCard({
  item,
  lang,
  onAdd,
  onCustomize,
  onNote,
}: {
  item: MasterDish
  lang: 'en' | 'ar'
  onAdd: (item: MasterDish) => void
  onCustomize: (item: MasterDish) => void
  onNote: (item: MasterDish) => void
}) {
  const { t } = useI18n()
  const label = localizedName(item, lang)
  const mark = item.code || (item.name.replace(/[^A-Za-z]/g, '').slice(0, 2) || '•').toUpperCase()
  const display = menuDisplayPrice(item)
  const hasOptions = Boolean(item.customizer)
  return (
    <div
      className={`mp-item-wrap${item.popular ? ' is-popular' : ''}${hasOptions ? ' has-options' : ''}`}
    >
      {item.popular ? (
        <span className="mp-item-popular-badge" title={t.mpFavorite} aria-label={t.mpFavorite}>
          {t.mpFavorite}
        </span>
      ) : null}
      <div className="mp-item-row">
        <button type="button" className="mp-item" onClick={() => (hasOptions ? onCustomize(item) : onAdd(item))}>
          <span className={`mp-item-thumb${item.imageDataUrl ? ' has-photo' : ''}`} aria-hidden>
            {item.imageDataUrl ? <img src={item.imageDataUrl} alt="" /> : mark}
          </span>
          <em className="item-code">{item.code}</em>
          <strong>{label}</strong>
          <span className="mp-item-meta">
            <span className="mp-item-price">
              {display.from ? <span className="mp-price-from">from </span> : null}
              {money(display.amount, lang)}
            </span>
          </span>
        </button>
        <button
          type="button"
          className="mp-add-btn"
          title={t.mpAddToOrder}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            hasOptions ? onCustomize(item) : onAdd(item)
          }}
        >
          +
        </button>
        <button
          type="button"
          className={`mp-note-btn${hasOptions ? ' is-opts' : ''}`}
          title={hasOptions ? t.mpCustomize : t.mpAddWithNote}
          onClick={(e) => {
            e.stopPropagation()
            hasOptions ? onCustomize(item) : onNote(item)
          }}
        >
          {hasOptions ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M4 7h10M14 7a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0ZM4 17h6M10 17a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0ZM20 17h-4M4 12h16"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              {t.mpCustomize}
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M5 6.5h14v11H5v-11Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <path d="M8 10h8M8 13.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              {t.taNoteLabel}
            </>
          )}
        </button>
      </div>
    </div>
  )
}
