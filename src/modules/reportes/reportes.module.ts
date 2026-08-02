import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { ReportesController } from './reportes.controller.js';
import { ReportesService } from './reportes.service.js';
import { ReportesQueryService } from './reportes-query.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [ReportesController],
  providers: [ReportesService, ReportesQueryService],
})
export class ReportesModule {}
