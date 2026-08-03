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
import { RegistroVisitaService } from './registro-visita.service.js';
import { CreateRegistroVisitaDto } from './dto/create-registro-visita.dto.js';
import { RequireResponsableAsistencia } from '../../shared/decorators/require-responsable-asistencia.decorator.js';
import type { AuthenticatedUser } from '../../shared/guards/auth.guard.js';

type AuthRequest = Request & { user: AuthenticatedUser };

@Controller('asistencias/proyectos/:proyectoId/visitas')
export class RegistroVisitaController {
  constructor(private visitasService: RegistroVisitaService) {}

  @Get()
  listar(
    @Param('proyectoId') proyectoId: string,
    @Query('fecha') fecha?: string,
  ) {
    return this.visitasService.listar(proyectoId, fecha);
  }

  @Post()
  @RequireResponsableAsistencia()
  registrarEntrada(
    @Param('proyectoId') proyectoId: string,
    @Body() dto: CreateRegistroVisitaDto,
    @Req() req: AuthRequest,
  ) {
    return this.visitasService.registrarEntrada(proyectoId, req.user.id, dto);
  }

  @Patch(':registroId/salida')
  @RequireResponsableAsistencia()
  marcarSalida(
    @Param('proyectoId') proyectoId: string,
    @Param('registroId') registroId: string,
  ) {
    return this.visitasService.marcarSalida(proyectoId, registroId);
  }
}
