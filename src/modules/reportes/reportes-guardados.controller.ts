import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { Modulo } from '../../shared/decorators/modulo.decorator.js';
import type { AuthenticatedUser } from '../../shared/guards/auth.guard.js';
import { ReportesGuardadosService } from './reportes-guardados.service.js';
import {
  CreateReporteGuardadoDto,
  UpdateReporteGuardadoDto,
} from './dto/reporte-guardado.dto.js';

type ReqAutenticado = Request & { user: AuthenticatedUser };

@Controller('reportes/guardados')
@Roles('gerencia', 'administrador')
@Modulo('reportes')
export class ReportesGuardadosController {
  constructor(private service: ReportesGuardadosService) {}

  @Get()
  listar(@Req() req: ReqAutenticado) {
    return this.service.listar(req.user);
  }

  @Post()
  crear(@Body() dto: CreateReporteGuardadoDto, @Req() req: ReqAutenticado) {
    return this.service.crear(dto, req.user);
  }

  @Patch(':id')
  actualizar(
    @Param('id') id: string,
    @Body() dto: UpdateReporteGuardadoDto,
    @Req() req: ReqAutenticado,
  ) {
    return this.service.actualizar(id, dto, req.user);
  }

  @Delete(':id')
  eliminar(@Param('id') id: string, @Req() req: ReqAutenticado) {
    return this.service.eliminar(id, req.user);
  }
}
