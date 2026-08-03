import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { ConsolidadoAsistenciaService } from './consolidado-asistencia.service.js';
import {
  ConsolidadoQueryDto,
  ConsolidadoTrabajadorQueryDto,
  PlanillaPreviewQueryDto,
} from './dto/consolidado-query.dto.js';
import { CreatePlanillaDto } from './dto/create-planilla.dto.js';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../../shared/guards/auth.guard.js';

type AuthRequest = Request & { user: AuthenticatedUser };

@Controller('asistencias')
@Roles('administrador', 'gerencia')
export class ConsolidadoAsistenciaController {
  constructor(private consolidadoService: ConsolidadoAsistenciaService) {}

  @Get('proyectos/:proyectoId/consolidado')
  consolidadoObra(
    @Param('proyectoId') proyectoId: string,
    @Query() query: ConsolidadoQueryDto,
  ) {
    return this.consolidadoService.consolidadoObra(
      proyectoId,
      query.desde,
      query.hasta,
    );
  }

  @Get('trabajadores/:trabajadorId/consolidado')
  consolidadoTrabajador(
    @Param('trabajadorId') trabajadorId: string,
    @Query() query: ConsolidadoTrabajadorQueryDto,
  ) {
    return this.consolidadoService.consolidadoTrabajador(
      trabajadorId,
      query.desde,
      query.hasta,
    );
  }

  @Get('proyectos/:proyectoId/planilla-preview')
  planillaPreview(
    @Param('proyectoId') proyectoId: string,
    @Query() query: PlanillaPreviewQueryDto,
  ) {
    return this.consolidadoService.planillaPreview(
      proyectoId,
      query.desde,
      query.hasta,
      query.valorHoraExtra,
    );
  }

  @Get('proyectos/:proyectoId/planillas')
  listarPlanillas(@Param('proyectoId') proyectoId: string) {
    return this.consolidadoService.listarPlanillas(proyectoId);
  }

  @Get('proyectos/:proyectoId/planillas/:planillaId')
  obtenerPlanilla(
    @Param('proyectoId') proyectoId: string,
    @Param('planillaId') planillaId: string,
  ) {
    return this.consolidadoService.obtenerPlanilla(proyectoId, planillaId);
  }

  @Post('proyectos/:proyectoId/planillas')
  generarPlanilla(
    @Param('proyectoId') proyectoId: string,
    @Body() dto: CreatePlanillaDto,
    @Req() req: AuthRequest,
  ) {
    return this.consolidadoService.generarPlanilla(
      proyectoId,
      req.user.id,
      dto.desde,
      dto.hasta,
      dto.valorHoraExtra,
    );
  }
}
