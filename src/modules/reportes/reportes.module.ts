import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { ReportesController } from './reportes.controller.js';
import { ReportesService } from './reportes.service.js';
import { ReportesQueryService } from './reportes-query.service.js';
import { ReportesGuardadosController } from './reportes-guardados.controller.js';
import { ReportesGuardadosService } from './reportes-guardados.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [ReportesGuardadosController, ReportesController],
  providers: [ReportesService, ReportesQueryService, ReportesGuardadosService],
})
export class ReportesModule {}
