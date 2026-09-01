import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import {
  DeliveryChannelsController,
  DeliveryOrdersChannelController,
} from './delivery-channels.controller'
import { DeliveryChannelsService } from './delivery-channels.service'

@Module({
  imports: [AuthModule],
  controllers: [DeliveryChannelsController, DeliveryOrdersChannelController],
  providers: [DeliveryChannelsService],
  exports: [DeliveryChannelsService],
})
export class DeliveryModule {}
