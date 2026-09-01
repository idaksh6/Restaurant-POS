import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { ZatcaController } from './zatca.controller'
import { ZatcaService } from './zatca.service'

@Module({
  imports: [AuthModule],
  controllers: [ZatcaController],
  providers: [ZatcaService],
  exports: [ZatcaService],
})
export class ZatcaModule {}
