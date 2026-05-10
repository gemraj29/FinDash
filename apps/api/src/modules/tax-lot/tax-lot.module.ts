import { Module } from '@nestjs/common';
import { TaxLotService } from './tax-lot.service';
import { TaxLotController } from './tax-lot.controller';

@Module({
  providers: [TaxLotService],
  controllers: [TaxLotController],
  exports: [TaxLotService],
})
export class TaxLotModule {}
