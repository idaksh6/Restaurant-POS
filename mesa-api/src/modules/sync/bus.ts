import { EventEmitter } from 'events'

export const mesaBus = new EventEmitter()

export function notifyTicketChanged(ticketId: string) {
  mesaBus.emit('ticket', ticketId)
}

/** Peers should pull SyncOps / refresh masters & access after REST writes. */
export function notifyMastersChanged(deviceId = 'api') {
  mesaBus.emit('masters', { type: 'masters.invalidate', deviceId })
}
