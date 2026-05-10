import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PortfolioService } from './portfolio.service';
import {
  Portfolio,
  Position,
  Trade,
  CreatePortfolioDTO,
  CreateTradeDTO,
  TradeFilter,
  TradeDirection,
} from '@findash/shared';

@Controller('portfolios')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  /** GET /portfolios */
  @Get()
  async findAll(): Promise<Portfolio[]> {
    return this.portfolioService.findAll();
  }

  /** GET /portfolios/:id */
  @Get(':id')
  async findById(@Param('id') id: string): Promise<Portfolio> {
    return this.portfolioService.findById(id);
  }

  /** POST /portfolios */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreatePortfolioDTO): Promise<Portfolio> {
    return this.portfolioService.create(dto);
  }

  /** POST /portfolios/:id/trades */
  @Post(':id/trades')
  @HttpCode(HttpStatus.CREATED)
  async addTrade(
    @Param('id') portfolioId: string,
    @Body() dto: Omit<CreateTradeDTO, 'portfolioId'>,
  ): Promise<Trade> {
    return this.portfolioService.addTrade({ ...dto, portfolioId });
  }

  /** GET /portfolios/:id/positions */
  @Get(':id/positions')
  async getPositions(@Param('id') id: string): Promise<Position[]> {
    return this.portfolioService.getPositions(id);
  }

  /** GET /portfolios/:id/trades?symbol=&direction=&fromDate=&toDate= */
  @Get(':id/trades')
  async getTradeHistory(
    @Param('id') id: string,
    @Query('symbol') symbol?: string,
    @Query('direction') direction?: TradeDirection,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<Trade[]> {
    const filters: TradeFilter = {
      ...(symbol ? { symbol } : {}),
      ...(direction ? { direction } : {}),
      ...(fromDate ? { fromDate: new Date(fromDate) } : {}),
      ...(toDate ? { toDate: new Date(toDate) } : {}),
      ...(limit ? { limit: parseInt(limit, 10) } : {}),
      ...(offset ? { offset: parseInt(offset, 10) } : {}),
    };
    return this.portfolioService.getTradeHistory(id, filters);
  }
}
