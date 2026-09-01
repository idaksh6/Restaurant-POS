import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { OrdersController } from './orders.controller'
import { OrdersService } from './orders.service'
import { WebhooksController } from './webhooks.controller'

@Module({
  imports: [AuthModule],
  controllers: [OrdersController, WebhooksController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
