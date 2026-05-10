import { Module } from '@nestjs/common';
import { CsvExportService } from './csv-export.service';
import { CsvExportController } from './csv-export.controller';

@Module({
  providers: [CsvExportService],
  controllers: [CsvExportController],
  exports: [CsvExportService],
})
export class CsvExportModule {}
