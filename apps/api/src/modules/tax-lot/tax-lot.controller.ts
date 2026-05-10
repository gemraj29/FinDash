import { Controller, Get, Param } from '@nestjs/common';
import { TaxLotService } from './tax-lot.service';
import { CostBasis } from '@findash/shared';

@Controller('positions')
export class TaxLotController {
  constructor(private readonly taxLotService: TaxLotService) {}

  /**
   * GET /positions/:positionId/cost-basis
   * Returns FIFO cost basis and open lots for a position.
   */
  @Get(':positionId/cost-basis')
  async getCostBasis(@Param('positionId') positionId: string): Promise<CostBasis> {
    return this.taxLotService.computeCostBasis(positionId);
  }
}
