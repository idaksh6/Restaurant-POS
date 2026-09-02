import { io, type Socket } from 'socket.io-client'
import { getApiBaseUrl } from '../lib/apiBase'
import { getDeviceId } from './deviceId'

/** Matches mesa-api SyncGateway (`socket.io` + `mesa` event). */
export type RealtimeEvent =
  | { type: 'ticket.updated'; ticketId?: string; deviceId?: string }
  | { type: 'kot.created'; ticketId?: string; deviceId?: string }
  | { type: 'masters.invalidate'; deviceId?: string }

type Handler = (event: RealtimeEvent) => void

let socket: Socket | null = null
const handlers = new Set<Handler>()

/** LiteSpeed/CyberPanel often breaks wss upgrade (HTTP/2); polling is reliable. */
function socketIoOptions(base: string) {
  const local =
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(base) ||
    base.startsWith('http://localhost') ||
    base.startsWith('http://127.0.0.1')
  if (local) {
    return { transports: ['websocket', 'polling'] as const, upgrade: true }
  }
  return { transports: ['polling'] as const, upgrade: false }
}

export function connectRealtime(apiBase?: string) {
  const base = apiBase ?? getApiBaseUrl()
  if (!base || typeof window === 'undefined') return () => undefined

  // Tear down any previous connection
  socket?.disconnect()
  socket = null

  const { transports, upgrade } = socketIoOptions(base)

  socket = io(base, {
    transports: [...transports],
    upgrade,
    query: { deviceId: getDeviceId() },
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 1500,
    timeout: 8000,
    autoConnect: true,
  })

  socket.on('mesa', (event: RealtimeEvent) => {
    handlers.forEach((h) => h(event))
  })

  // Quiet failures — offline POS must keep working without WS
  socket.on('connect_error', () => {
    /* ignore — sync HTTP still works */
  })

  return () => {
    socket?.disconnect()
    socket = null
  }
}

export function onRealtime(handler: Handler) {
  handlers.add(handler)
  return () => handlers.delete(handler)
}
