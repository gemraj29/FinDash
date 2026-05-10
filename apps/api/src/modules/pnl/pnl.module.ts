import { Module } from '@nestjs/common';
import { PnlService } from './pnl.service';
import { PnlController } from './pnl.controller';

@Module({
  providers: [PnlService],
  controllers: [PnlController],
  exports: [PnlService],
})
export class PnlModule {}
