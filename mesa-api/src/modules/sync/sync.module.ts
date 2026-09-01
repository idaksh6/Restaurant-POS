import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { AccessModule } from '../access/access.module'
import { MastersModule } from '../masters/masters.module'
import { OrdersModule } from '../orders/orders.module'
import { ZatcaModule } from '../zatca/zatca.module'
import { SyncController } from './sync.controller'
import { SyncService } from './sync.service'
import { SyncGateway } from './sync.gateway'

@Module({
  imports: [AuthModule, AccessModule, MastersModule, OrdersModule, ZatcaModule],
  controllers: [SyncController],
  providers: [SyncService, SyncGateway],
  exports: [SyncService],
})
export class SyncModule {}
