import { Module } from '@nestjs/common';
import { MarketDataService } from './market-data.service';
import { MarketDataGateway } from './market-data.gateway';

@Module({
  providers: [MarketDataService, MarketDataGateway],
  exports: [MarketDataService],
})
export class MarketDataModule {}
