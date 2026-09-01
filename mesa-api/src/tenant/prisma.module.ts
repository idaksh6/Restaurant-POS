import { Global, Module } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { TenantDbService } from './tenant-db.service'
import { TenantModule } from './tenant.module'

@Global()
@Module({
  imports: [TenantModule],
  providers: [
    {
      provide: PrismaService,
      useFactory: (tenants: TenantDbService) => tenants.createRoutedProxy(),
      inject: [TenantDbService],
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
