import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Server } from 'socket.io'
import { mesaBus } from './bus'

// Match HTTP CORS: Nest owns it unless CORS_IN_APP=0 (proxy-only CORS).
const gatewayCors =
  process.env.CORS_IN_APP === '0' ? false : { origin: true }

@WebSocketGateway({ cors: gatewayCors })
export class SyncGateway implements OnModuleInit, OnModuleDestroy {
  private onTicket = (ticketId: string) => {
    this.broadcast({ type: 'ticket.updated', ticketId })
  }

  private onMasters = (event: unknown) => {
    this.broadcast(event ?? { type: 'masters.invalidate', deviceId: 'api' })
  }

  @WebSocketServer()
  server!: Server

  onModuleInit() {
    mesaBus.on('ticket', this.onTicket)
    mesaBus.on('masters', this.onMasters)
  }

  onModuleDestroy() {
    mesaBus.off('ticket', this.onTicket)
    mesaBus.off('masters', this.onMasters)
  }

  broadcast(event: unknown) {
    this.server?.emit('mesa', event)
  }

  @SubscribeMessage('ping')
  ping(@MessageBody() data: unknown) {
    return { event: 'pong', data }
  }
}
