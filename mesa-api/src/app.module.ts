import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { AccessModule } from './modules/access/access.module'
import { AuthModule } from './modules/auth/auth.module'
import { MastersModule } from './modules/masters/masters.module'
import { OrdersModule } from './modules/orders/orders.module'
import { SyncModule } from './modules/sync/sync.module'
import { DevModule } from './modules/dev/dev.module'
import { DeliveryModule } from './modules/delivery/delivery.module'
import { ZatcaModule } from './modules/zatca/zatca.module'
import { HealthController } from './health.controller'
import { SeedModule } from './seed.module'
import { TenantMiddleware } from './tenant/tenant.middleware'
import { PrismaModule } from './tenant/prisma.module'

@Global()
@Module({
  imports: [
    PrismaModule,
    SeedModule,
    AuthModule,
    AccessModule,
    MastersModule,
    OrdersModule,
    DeliveryModule,
    SyncModule,
    DevModule,
    ZatcaModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*')
  }
}
