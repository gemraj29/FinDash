import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { CsvExportService } from './csv-export.service';
import { TradeFilter, TradeDirection } from '@findash/shared';

@Controller('portfolios')
export class CsvExportController {
  constructor(private readonly csvExportService: CsvExportService) {}

  /**
   * GET /portfolios/:id/export/trades
   * Downloads trades as trades_<id>_<date>.csv
   */
  @Get(':id/export/trades')
  async exportTrades(
    @Param('id') portfolioId: string,
    @Query('symbol') symbol: string | undefined,
    @Query('direction') direction: TradeDirection | undefined,
    @Query('fromDate') fromDate: string | undefined,
    @Query('toDate') toDate: string | undefined,
    @Res() res: Response,
  ) {
    const filters: TradeFilter = {
      ...(symbol ? { symbol } : {}),
      ...(direction ? { direction } : {}),
      ...(fromDate ? { fromDate: new Date(fromDate) } : {}),
      ...(toDate ? { toDate: new Date(toDate) } : {}),
    };

    const csv = await this.csvExportService.exportTrades(portfolioId, filters);
    const filename = `trades_${portfolioId}_${new Date().toISOString().split('T')[0]}.csv`;

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': csv.length,
    });
    res.send(csv);
  }

  /**
   * GET /portfolios/:id/export/tax-lots
   * Downloads all FIFO tax lots as tax_lots_<id>_<date>.csv
   */
  @Get(':id/export/tax-lots')
  async exportTaxLots(@Param('id') portfolioId: string, @Res() res: Response) {
    const csv = await this.csvExportService.exportTaxLots(portfolioId);
    const filename = `tax_lots_${portfolioId}_${new Date().toISOString().split('T')[0]}.csv`;

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': csv.length,
    });
    res.send(csv);
  }
}
