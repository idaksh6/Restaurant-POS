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

export function connectRealtime(apiBase?: string) {
  const base = apiBase ?? getApiBaseUrl()
  if (!base || typeof window === 'undefined') return () => undefined

  // Tear down any previous connection
  socket?.disconnect()
  socket = null

  socket = io(base, {
    // Polling first: LiteSpeed reverse-proxy often fails pure websocket upgrades.
    // Socket.IO then upgrades to websocket when the proxy allows it.
    transports: ['polling', 'websocket'],
    upgrade: true,
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
