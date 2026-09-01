import { Global, Module } from '@nestjs/common'
import { TenantDbService } from './tenant-db.service'

@Global()
@Module({
  providers: [TenantDbService],
  exports: [TenantDbService],
})
export class TenantModule {}
