import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PnlService } from './pnl.service';
import { PnLSummary, DateRange } from '@findash/shared';

@UseGuards(JwtAuthGuard)
@Controller('portfolios')
export class PnlController {
  constructor(private readonly pnlService: PnlService) {}

  /** GET /portfolios/:id/pnl/unrealized */
  @Get(':id/pnl/unrealized')
  async getUnrealized(@Param('id') id: string): Promise<PnLSummary> {
    return this.pnlService.calculateUnrealizedPnl(id);
  }

  /** GET /portfolios/:id/pnl/realized?fromDate=&toDate= */
  @Get(':id/pnl/realized')
  async getRealized(
    @Param('id') id: string,
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
  ): Promise<PnLSummary> {
    const dateRange: DateRange = {
      fromDate: new Date(fromDate),
      toDate: new Date(toDate),
    };
    return this.pnlService.calculateRealizedPnl(id, dateRange);
  }
}
