import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { money, type Table } from '../data/mock'
import { localizedAreaName } from '../lib/branding'
import { useI18n } from '../locale/i18n'
import FloorPlanTableMark from './FloorPlanTableMark'

export type FloorDiagramSection = {
  name: string
  tables: Table[]
}

type Props = {
  sections: FloorDiagramSection[]
  selectedId: string | null
  selectedOpen?: boolean
  itemCountByTable: Record<string, number>
  onSelectTable: (id: string) => void
  statusLabel: (status: string) => string
  emptyHint: string
  emptyTitle: string
  branchId?: string
}

type RoomBox = { x: number; y: number; w: number; h: number; role: 'main' | 'side' | 'service' }
type Spot = { left: number; top: number }
type PlanSave = {
  rooms: Record<string, RoomBox>
  tables: Record<string, Spot>
}

const PLAN_KEY = 'mesa-floor-plan-layout-v1'
const HOLD_MS = 380
const CANCEL_PX = 14

function storageKey(branchId?: string) {
  return `${PLAN_KEY}:${branchId || 'default'}`
}

function loadPlan(branchId?: string): PlanSave {
  try {
    const raw = localStorage.getItem(storageKey(branchId))
    if (!raw) return { rooms: {}, tables: {} }
    const parsed = JSON.parse(raw) as PlanSave
    return {
      rooms: parsed.rooms && typeof parsed.rooms === 'object' ? parsed.rooms : {},
      tables: parsed.tables && typeof parsed.tables === 'object' ? parsed.tables : {},
    }
  } catch {
    return { rooms: {}, tables: {} }
  }
}

function savePlan(branchId: string | undefined, plan: PlanSave) {
  try {
    localStorage.setItem(storageKey(branchId), JSON.stringify(plan))
  } catch {
    /* ignore */
  }
}

function defaultRooms(areaNames: string[]): Record<string, RoomBox> {
  const sideSlots: RoomBox[] = [
    { x: 3.5, y: 4, w: 22, h: 28, role: 'side' },
    { x: 74.5, y: 4, w: 22, h: 22, role: 'side' },
    { x: 3.5, y: 68, w: 22, h: 28, role: 'side' },
    { x: 28, y: 72, w: 28, h: 24, role: 'side' },
    { x: 74.5, y: 68, w: 22, h: 28, role: 'side' },
    { x: 3.5, y: 36, w: 18, h: 28, role: 'side' },
  ]
  const areas: Record<string, RoomBox> = {}
  if (!areaNames.length) return areas
  const [primary, ...rest] = areaNames
  areas[primary] = { x: 28, y: 4, w: 44, h: 64, role: 'main' }
  rest.forEach((name, i) => {
    areas[name] = sideSlots[i] ?? {
      x: 28 + (i % 2) * 24,
      y: 72,
      w: 22,
      h: 24,
      role: 'side',
    }
  })
  return areas
}

function defaultServices() {
  return [
    { key: 'kitchen', label: 'Kitchen', box: { x: 74.5, y: 30, w: 22, h: 16, role: 'service' as const } },
    { key: 'wash', label: 'Wash', box: { x: 74.5, y: 48, w: 10, h: 16, role: 'service' as const } },
    { key: 'entry', label: 'Entrance', box: { x: 86.5, y: 48, w: 10, h: 16, role: 'service' as const } },
  ]
}

function autoSpots(count: number, role: RoomBox['role']): Spot[] {
  if (count <= 0) return []
  const isMain = role === 'main'
  const cols = isMain
    ? Math.min(4, Math.max(2, Math.ceil(Math.sqrt(count))))
    : Math.min(3, Math.max(1, Math.ceil(Math.sqrt(count))))
  const rows = Math.ceil(count / cols)
  const padX = isMain ? 14 : 18
  const padY = isMain ? 16 : 22
  const out: Spot[] = []
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols)
    const c = i % cols
    const stagger = isMain && r % 2 === 1 ? 5 : 0
    const left =
      padX +
      (cols <= 1 ? (100 - padX * 2) / 2 : (c / Math.max(cols - 1, 1)) * (100 - padX * 2)) +
      stagger
    const top =
      padY + (rows <= 1 ? (100 - padY * 2) / 2 : (r / Math.max(rows - 1, 1)) * (100 - padY * 2))
    out.push({
      left: Math.min(88, Math.max(12, left)),
      top: Math.min(86, Math.max(18, top)),
    })
  }
  return out
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function nodeSize(seats: number) {
  if (seats <= 2) return 'sm'
  if (seats <= 4) return 'md'
  if (seats <= 6) return 'lg'
  return 'xl'
}

export default function FloorDiagram({
  sections,
  selectedId,
  selectedOpen = false,
  itemCountByTable,
  onSelectTable,
  statusLabel: _statusLabel,
  emptyHint,
  emptyTitle,
  branchId,
}: Props) {
  const { t, lang } = useI18n()
  const buildingRef = useRef<HTMLDivElement | null>(null)
  const saved = useMemo(() => loadPlan(branchId), [branchId])

  const baseRooms = useMemo(
    () => defaultRooms(sections.map((s) => s.name)),
    [sections],
  )

  const [rooms, setRooms] = useState<Record<string, RoomBox>>(() => ({
    ...baseRooms,
    ...Object.fromEntries(
      Object.entries(saved.rooms).filter(([name]) => baseRooms[name]),
    ),
  }))
  const [tablePos, setTablePos] = useState<Record<string, Spot>>(saved.tables)
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const dragMoved = useRef(false)
  const roomsRef = useRef(rooms)
  const tablePosRef = useRef(tablePos)
  roomsRef.current = rooms
  tablePosRef.current = tablePos

  useEffect(() => {
    setRooms({
      ...baseRooms,
      ...Object.fromEntries(
        Object.entries(loadPlan(branchId).rooms).filter(([name]) => baseRooms[name]),
      ),
    })
    setTablePos(loadPlan(branchId).tables)
  }, [branchId, baseRooms])

  const persist = useCallback(
    (nextRooms: Record<string, RoomBox>, nextTables: Record<string, Spot>) => {
      savePlan(branchId, { rooms: nextRooms, tables: nextTables })
    },
    [branchId],
  )

  function resetLayout() {
    const nextRooms = defaultRooms(sections.map((s) => s.name))
    setRooms(nextRooms)
    setTablePos({})
    persist(nextRooms, {})
  }

  function lockScroll(frame: HTMLElement | null, el: HTMLElement) {
    el.style.touchAction = 'none'
    if (frame) frame.style.touchAction = 'none'
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    document.body.style.touchAction = 'none'
  }

  function unlockScroll(frame: HTMLElement | null, el: HTMLElement) {
    el.style.touchAction = ''
    if (frame) frame.style.touchAction = ''
    document.documentElement.style.overflow = ''
    document.body.style.overflow = ''
    document.body.style.touchAction = ''
  }

  function bindPressDrag(opts: {
    e: ReactPointerEvent
    key: string
    target: HTMLElement
    onDrag: (clientX: number, clientY: number, originX: number, originY: number) => void
  }) {
    const { e, key, target, onDrag } = opts
    const pointerId = e.pointerId
    const needsHold = e.pointerType === 'touch' || e.pointerType === 'pen'
    const frame = target.closest('.iso-plan-frame') as HTMLElement | null
    let originX = e.clientX
    let originY = e.clientY
    let lastX = e.clientX
    let lastY = e.clientY
    let armed = !needsHold
    let cancelled = false
    let holdTimer: ReturnType<typeof setTimeout> | null = null
    dragMoved.current = false

    function blockTouchScroll(ev: TouchEvent) {
      if (!armed) return
      if (ev.cancelable) ev.preventDefault()
    }

    function cleanup() {
      if (holdTimer) clearTimeout(holdTimer)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('touchmove', blockTouchScroll)
      unlockScroll(frame, target)
      setDraggingKey(null)
      try {
        target.releasePointerCapture(pointerId)
      } catch {
        /* ignore */
      }
    }

    function arm() {
      if (cancelled || armed) return
      armed = true
      // Start drag from where the finger is now (after hold), not the original tap
      originX = lastX
      originY = lastY
      lockScroll(frame, target)
      try {
        target.setPointerCapture(pointerId)
      } catch {
        /* ignore */
      }
      try {
        navigator.vibrate?.(10)
      } catch {
        /* ignore */
      }
      setDraggingKey(key)
    }

    if (!needsHold) {
      e.preventDefault()
      e.stopPropagation()
      arm()
    } else {
      holdTimer = setTimeout(arm, HOLD_MS)
    }

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return
      lastX = ev.clientX
      lastY = ev.clientY
      const px = Math.hypot(ev.clientX - originX, ev.clientY - originY)
      if (!armed) {
        // Cancel hold only if finger clearly slid (user is scrolling)
        if (px > CANCEL_PX) {
          cancelled = true
          if (holdTimer) clearTimeout(holdTimer)
          holdTimer = null
        }
        return
      }
      if (ev.cancelable) ev.preventDefault()
      const dragPx = Math.hypot(ev.clientX - originX, ev.clientY - originY)
      if (dragPx > 2) dragMoved.current = true
      onDrag(ev.clientX, ev.clientY, originX, originY)
    }

    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return
      const didDrag = armed && dragMoved.current
      cleanup()
      if (didDrag) persist(roomsRef.current, tablePosRef.current)
    }

    // Spurious cancel after long-press is common on mobile — keep dragging if armed
    function onCancel(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return
      if (!armed) {
        cleanup()
        return
      }
      try {
        target.setPointerCapture(pointerId)
      } catch {
        const didDrag = dragMoved.current
        cleanup()
        if (didDrag) persist(roomsRef.current, tablePosRef.current)
      }
    }

    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('touchmove', blockTouchScroll, { passive: false })
  }

  function startRoomDrag(areaName: string, e: ReactPointerEvent) {
    if ((e.target as HTMLElement).closest('.iso-table')) return
    const building = buildingRef.current
    if (!building) return
    const box = roomsRef.current[areaName]
    if (!box) return
    const buildingEl = building
    const orig = { ...box }
    const target = e.currentTarget as HTMLElement

    bindPressDrag({
      e,
      key: `room:${areaName}`,
      target,
      onDrag: (clientX, clientY, originX, originY) => {
        const rect = buildingEl.getBoundingClientRect()
        if (!rect.width || !rect.height) return
        const dx = ((clientX - originX) / rect.width) * 100
        const dy = ((clientY - originY) / rect.height) * 100
        setRooms((prev) => ({
          ...prev,
          [areaName]: {
            ...orig,
            x: clamp(orig.x + dx, 1, 99 - orig.w),
            y: clamp(orig.y + dy, 1, 99 - orig.h),
          },
        }))
      },
    })
  }

  function startTableDrag(tableId: string, roomEl: HTMLElement, spot: Spot, e: ReactPointerEvent) {
    const floor = roomEl.querySelector('.iso-room-floor') as HTMLElement | null
    if (!floor) return
    const floorEl = floor
    const current = { ...spot }
    const target = e.currentTarget as HTMLElement

    bindPressDrag({
      e,
      key: `table:${tableId}`,
      target,
      onDrag: (clientX, clientY, originX, originY) => {
        const rect = floorEl.getBoundingClientRect()
        if (!rect.width || !rect.height) return
        const dx = ((clientX - originX) / rect.width) * 100
        const dy = ((clientY - originY) / rect.height) * 100
        setTablePos((prev) => ({
          ...prev,
          [tableId]: {
            left: clamp(current.left + dx, 8, 92),
            top: clamp(current.top + dy, 14, 90),
          },
        }))
      },
    })
  }

  if (sections.length === 0) {
    return (
      <div className="ticket-empty floor-diagram-empty">
        <strong>{emptyTitle}</strong>
        {emptyHint}
      </div>
    )
  }

  return (
    <div className="iso-plan" role="region" aria-label={t.floorViewDiagram}>
      <div className="iso-plan-guide">
        <div className="iso-plan-howto">
          <span className="iso-how">
            <i className="iso-how-ico tap" aria-hidden />
            {t.floorHowToTap}
          </span>
          <span className="iso-how">
            <i className="iso-how-ico hold" aria-hidden />
            {t.floorHowToHold}
          </span>
        </div>
        <div className="iso-plan-legend" aria-label="Status">
          <span className="leg free">{t.tableFree}</span>
          <span className="leg occupied">{t.tableOccupied}</span>
          <span className="leg billing">{t.tableBilling}</span>
        </div>
        <button type="button" className="iso-reset-btn" onClick={resetLayout}>
          {t.floorResetLayout}
        </button>
      </div>

      <div className={`iso-plan-frame${draggingKey ? ' is-dragging' : ''}`}>
        <div className="iso-plan-building" ref={buildingRef}>
          {defaultServices().map((svc) => (
            <div
              key={svc.key}
              className={`iso-room service ${svc.key}`}
              style={{
                left: `${svc.box.x}%`,
                top: `${svc.box.y}%`,
                width: `${svc.box.w}%`,
                height: `${svc.box.h}%`,
              }}
            >
              <span className="iso-room-name">{svc.label}</span>
              {svc.key === 'kitchen' ? (
                <div className="iso-kitchen-blocks" aria-hidden>
                  <i />
                  <i />
                  <i />
                </div>
              ) : null}
              {svc.key === 'wash' ? <span className="iso-fixture wash" aria-hidden /> : null}
              {svc.key === 'entry' ? <span className="iso-fixture door" aria-hidden /> : null}
            </div>
          ))}

          {sections.map((section) => {
            const box = rooms[section.name] ?? baseRooms[section.name]
            if (!box) return null
            const defaults = autoSpots(section.tables.length, box.role)
            const free = section.tables.filter((x) => x.status === 'free').length
            const busyCount = section.tables.length - free
            const roomBusy = busyCount > 0
            const roomDragging = draggingKey === `room:${section.name}`
            return (
              <div
                key={section.name}
                className={`iso-room area ${box.role}${roomBusy ? ' has-busy' : ''}${roomDragging ? ' is-dragging' : ''}`}
                style={{
                  left: `${box.x}%`,
                  top: `${box.y}%`,
                  width: `${box.w}%`,
                  height: `${box.h}%`,
                }}
              >
                <div
                  className="iso-room-head drag-handle"
                  onPointerDown={(e) => startRoomDrag(section.name, e)}
                  onContextMenu={(e) => e.preventDefault()}
                  title={t.floorDragRoom}
                >
                  <strong>{localizedAreaName(section.name, lang)}</strong>
                  <em className={roomBusy ? 'busy' : 'free'}>
                    {roomBusy
                      ? `${busyCount} ${t.floorBusyCount}`
                      : t.floorAreaAllFree}
                  </em>
                </div>
                <div className="iso-room-floor">
                  {section.tables.map((table, index) => {
                    const spot = tablePos[table.id] ?? defaults[index] ?? { left: 50, top: 50 }
                    const isActive = table.status !== 'free'
                    const itemCount = itemCountByTable[table.id] ?? 0
                    const selected = selectedId === table.id && selectedOpen
                    const guests = table.guests ?? 0
                    const tableDragging = draggingKey === `table:${table.id}`
                    const statusText =
                      table.status === 'billing'
                        ? t.tableBilling
                        : table.status === 'occupied'
                          ? t.tableOccupied
                          : table.status === 'merged'
                            ? `${t.tableMerged}${table.mergedIntoLabel ? ` → T${table.mergedIntoLabel}` : ''}`
                            : t.tableFree
                    return (
                      <button
                        key={table.id}
                        type="button"
                        className={`iso-table size-${nodeSize(table.seats)} status-${table.status}${selected ? ' selected' : ''}${isActive ? ' is-live' : ''}${tableDragging ? ' is-dragging' : ''}`}
                        style={{ left: `${spot.left}%`, top: `${spot.top}%` }}
                        onPointerDown={(e) => {
                          const roomEl = e.currentTarget.closest('.iso-room') as HTMLElement
                          if (roomEl) startTableDrag(table.id, roomEl, spot, e)
                        }}
                        onContextMenu={(e) => e.preventDefault()}
                        onClick={() => {
                          if (dragMoved.current) return
                          onSelectTable(table.id)
                        }}
                        title={`${localizedAreaName(section.name, lang)} · T${table.label} · ${table.seats} ${t.floorSeats} · ${statusText}${
                          isActive
                            ? ` · ${itemCount} ${itemCount === 1 ? t.itemOne : t.itemMany} · ${
                                typeof table.amount === 'number' ? money(table.amount) : money(0)
                              }`
                            : ` · ${t.tapToSeat}`
                        }`}
                      >
                        <span className="iso-table-icon" aria-hidden>
                          <FloorPlanTableMark seats={table.seats} status={table.status} />
                        </span>
                        <span className="iso-table-meta">
                          <strong>
                            T{table.label}
                            <small>
                              {table.seats} {t.floorSeats}
                            </small>
                          </strong>
                          <span className={`iso-status-chip status-${table.status}${table.mergedFromLabels?.length ? ' has-merge' : ''}`}>
                            {statusText}
                            {table.mergedFromLabels?.length
                              ? ` · +${table.mergedFromLabels.map((l) => `T${l}`).join(' · ')}`
                              : ''}
                            {table.status !== 'merged' && !table.mergedFromLabels?.length && isActive && guests > 0
                              ? ` · ${guests}`
                              : ''}
                            {table.status === 'merged'
                              ? ` · ${money(0)}`
                              : isActive && typeof table.amount === 'number' && table.amount > 0
                                ? ` · ${money(table.amount)}`
                                : ''}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
