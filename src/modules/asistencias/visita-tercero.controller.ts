import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { VisitaTerceroService } from './visita-tercero.service.js';
import { CreateVisitaTerceroDto } from './dto/create-visita-tercero.dto.js';
import { RequireResponsableAsistencia } from '../../shared/decorators/require-responsable-asistencia.decorator.js';
import type { AuthenticatedUser } from '../../shared/guards/auth.guard.js';

type AuthRequest = Request & { user: AuthenticatedUser };

@Controller('asistencias/proyectos/:proyectoId/terceros')
export class VisitaTerceroController {
  constructor(private tercerosService: VisitaTerceroService) {}

  @Get()
  listar(
    @Param('proyectoId') proyectoId: string,
    @Query('fecha') fecha?: string,
  ) {
    return this.tercerosService.listar(proyectoId, fecha);
  }

  @Post()
  @RequireResponsableAsistencia()
  registrar(
    @Param('proyectoId') proyectoId: string,
    @Body() dto: CreateVisitaTerceroDto,
    @Req() req: AuthRequest,
  ) {
    return this.tercerosService.registrar(proyectoId, req.user.id, dto);
  }

  @Patch(':visitaId/visitantes/:visitanteId/salida')
  @RequireResponsableAsistencia()
  marcarSalidaVisitante(
    @Param('proyectoId') proyectoId: string,
    @Param('visitaId') visitaId: string,
    @Param('visitanteId') visitanteId: string,
  ) {
    return this.tercerosService.marcarSalidaVisitante(
      proyectoId,
      visitaId,
      visitanteId,
    );
  }
}
