import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '../state/AuthContext'
import { notifyTicketsSynced } from '../data/repos/ticketsRepo'
import { applyBootstrap, applyIncoming, type SyncEntity } from './applyIncoming'
import { reconcileZatcaOutbox } from '../hardware/zatca'
import { getDeviceId } from './deviceId'
import {
  hydrateOutboxFromDexie,
  loadOutbox,
  OUTBOX_EVENT,
  pendingCount,
  pruneRedundantOutbox,
  sanitizePoisonOutbox,
  type OutboxOp,
} from './outbox'
import { connectRealtime, onRealtime } from './realtime'
import { apiHealth } from '../lib/apiAuth'
import { getApiBaseUrl } from '../lib/apiBase'
import { bootstrapSync, flushOutbox, pullSync, setSyncCursor } from './syncClient'

export type Connectivity = 'online' | 'offline' | 'syncing'

type SyncValue = {
  deviceId: string
  connectivity: Connectivity
  queued: number
  outbox: OutboxOp[]
  syncEpoch: number
  refreshOutbox: () => void
  runSync: (opts?: { quiet?: boolean; force?: boolean }) => Promise<void>
  recheckConnection: () => Promise<boolean>
}

const SyncContext = createContext<SyncValue | null>(null)

function apiBase() {
  return getApiBaseUrl()
}

function isTicketSyncOp(type?: string) {
  const t = String(type ?? '')
  return t.startsWith('ticket') || t.startsWith('kot')
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  const deviceId = useMemo(() => getDeviceId(), [])
  const [browserOnline, setBrowserOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )
  const [serverReachable, setServerReachable] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [queued, setQueued] = useState(() => pendingCount())
  const [outbox, setOutbox] = useState<OutboxOp[]>(() => loadOutbox())
  const [syncEpoch, setSyncEpoch] = useState(0)
  const bootstrapped = useRef<string | null>(null)
  const flushLock = useRef(false)
  const flushAgain = useRef(false)

  const refreshOutbox = useCallback(() => {
    pruneRedundantOutbox()
    setOutbox(loadOutbox())
    setQueued(pendingCount())
  }, [])

  const bumpEpoch = useCallback(() => {
    setSyncEpoch((n) => n + 1)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('mesa:access-refresh'))
    }
  }, [])

  const runFlush = useCallback(async () => {
    const base = apiBase()
    if (!browserOnline || !base) {
      refreshOutbox()
      return
    }
    if (!sessionStorage.getItem('mesa-token')) {
      try {
        await flushOutbox(base, deviceId)
      } catch {
        /* ignore */
      }
      refreshOutbox()
      return
    }
    if (!serverReachable) {
      refreshOutbox()
      return
    }
    if (flushLock.current) {
      flushAgain.current = true
      refreshOutbox()
      return
    }
    flushLock.current = true
    try {
      do {
        flushAgain.current = false
        await flushOutbox(base, deviceId)
        await reconcileZatcaOutbox()
        pruneRedundantOutbox()
        refreshOutbox()
      } while (flushAgain.current)
    } catch {
      await reconcileZatcaOutbox().catch(() => undefined)
      pruneRedundantOutbox()
      refreshOutbox()
    } finally {
      flushLock.current = false
      if (flushAgain.current) {
        flushAgain.current = false
        queueMicrotask(() => {
          void runFlush()
        })
      }
    }
  }, [browserOnline, serverReachable, deviceId, refreshOutbox])

  const runSync = useCallback(async (opts?: { quiet?: boolean; force?: boolean }) => {
    const base = apiBase()
    if (!browserOnline || !base) {
      refreshOutbox()
      return
    }
    if (!opts?.force && !serverReachable) {
      refreshOutbox()
      return
    }
    const quiet = opts?.quiet === true
    if (!quiet) setSyncing(true)
    try {
      // Manual / forced sync retries poison once; quiet interval sync must not.
      if (!quiet) sanitizePoisonOutbox({ requeue: true })
      await runFlush()
      await reconcileZatcaOutbox()
      pruneRedundantOutbox()
      const pulled = await pullSync(base)
      const entities = Array.isArray(pulled.entities) ? (pulled.entities as SyncEntity[]) : []
      const n = await applyIncoming(entities, deviceId)
      const mastersChanged = n > 0 && entities.some((e) => !isTicketSyncOp(e.type))
      if (mastersChanged) bumpEpoch()
      if (entities.some((e) => isTicketSyncOp(e.type))) notifyTicketsSynced()
      refreshOutbox()
    } catch {
      refreshOutbox()
    } finally {
      if (!quiet) setSyncing(false)
    }
  }, [browserOnline, serverReachable, refreshOutbox, bumpEpoch, runFlush, deviceId])

  const recheckConnection = useCallback(async () => {
    if (!apiBase() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      setServerReachable(false)
      return false
    }
    let reachable = false
    try {
      reachable = await apiHealth(4000)
    } catch {
      reachable = false
    }
    setServerReachable(reachable)
    if (reachable) await runSync({ quiet: true, force: true })
    return reachable
  }, [runSync])

  useEffect(() => {
    void hydrateOutboxFromDexie().then(() => {
      // One-shot requeue after load so fixed server issues can clear; auto flush must not requeue.
      sanitizePoisonOutbox({ requeue: true })
      pruneRedundantOutbox()
      void reconcileZatcaOutbox().finally(() => refreshOutbox())
    })
  }, [refreshOutbox])

  useEffect(() => {
    const onOutbox = () => {
      queueMicrotask(() => {
        refreshOutbox()
        void runFlush()
      })
    }
    window.addEventListener(OUTBOX_EVENT, onOutbox)
    return () => window.removeEventListener(OUTBOX_EVENT, onOutbox)
  }, [refreshOutbox, runFlush])

  useEffect(() => {
    if (!browserOnline || !serverReachable || !apiBase()) return
    const id = window.setInterval(() => {
      if (pendingCount() > 0) void runFlush()
    }, 4000)
    return () => window.clearInterval(id)
  }, [browserOnline, serverReachable, runFlush])

  useEffect(() => {
    if (!browserOnline || !serverReachable || !apiBase() || !token) return
    const id = window.setInterval(() => {
      void runSync({ quiet: true })
    }, 6000)
    return () => window.clearInterval(id)
  }, [browserOnline, serverReachable, token, runSync])

  useEffect(() => {
    const on = () => setBrowserOnline(true)
    const off = () => setBrowserOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  useEffect(() => {
    if (!apiBase()) return
    let cancelled = false
    const tick = async () => {
      if (!browserOnline) {
        if (!cancelled) setServerReachable(false)
        return
      }
      // Use a short timeout so the check fails fast when offline.
      // We deliberately catch all errors silently — console errors
      // (ERR_INTERNET_DISCONNECTED etc.) are avoided by not letting
      // the browser treat this as an unhandled network failure.
      let reachable = false
      try {
        reachable = await apiHealth(4000)
      } catch {
        reachable = false
      }
      if (!cancelled) setServerReachable(reachable)
    }
    tick()
    const id = window.setInterval(tick, 20000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [browserOnline])

  useEffect(() => {
    const base = apiBase()
    if (!browserOnline || !serverReachable || !base || !token) return
    if (bootstrapped.current === token) {
      void runFlush()
      return
    }
    let cancelled = false
    ;(async () => {
      setSyncing(true)
      try {
        const data = await bootstrapSync(base)
        if (cancelled) return
        await applyBootstrap(data as never)
        if (data.cursor) setSyncCursor(data.cursor)
        bootstrapped.current = token
        bumpEpoch()
        await flushOutbox(base, deviceId)
        refreshOutbox()
      } catch {
        void runSync({ quiet: true })
      } finally {
        if (!cancelled) setSyncing(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [browserOnline, serverReachable, token, runSync, runFlush, deviceId, refreshOutbox, bumpEpoch])

  useEffect(() => {
    const base = apiBase()
    if (!browserOnline || !serverReachable || !base) return
    const disconnect = connectRealtime(base)
    const off = onRealtime((event) => {
      if (event.deviceId && event.deviceId === deviceId) return
      if (event.type === 'ticket.updated' || event.type === 'kot.created') {
        void runSync({ quiet: true }).finally(() => notifyTicketsSynced())
        return
      }
      // Apply SyncOps first, then always refresh masters from API so deletes
      // stick even when the SyncOp was missed / REST-only.
      void runSync({ quiet: true }).finally(() => bumpEpoch())
    })
    return () => {
      disconnect()
      off()
    }
  }, [browserOnline, serverReachable, refreshOutbox, runSync, bumpEpoch, deviceId])

  const connected = browserOnline && serverReachable
  const connectivity: Connectivity = !connected ? 'offline' : syncing ? 'syncing' : 'online'

  const value = useMemo(
    () => ({
      deviceId,
      connectivity,
      queued,
      outbox,
      syncEpoch,
      refreshOutbox,
      runSync,
      recheckConnection,
    }),
    [deviceId, connectivity, queued, outbox, syncEpoch, refreshOutbox, runSync, recheckConnection],
  )

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSync() {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSync must be used inside SyncProvider')
  return ctx
}
