import { Module } from '@nestjs/common';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { AuthModule } from './common/auth/auth.module';
import { PortfolioModule } from './modules/portfolio/portfolio.module';
import { TaxLotModule } from './modules/tax-lot/tax-lot.module';
import { PnlModule } from './modules/pnl/pnl.module';
import { MarketDataModule } from './modules/market-data/market-data.module';
import { CsvExportModule } from './modules/csv-export/csv-export.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    AuthModule,
    PortfolioModule,
    TaxLotModule,
    PnlModule,
    MarketDataModule,
    CsvExportModule,
  ],
})
export class AppModule {}
