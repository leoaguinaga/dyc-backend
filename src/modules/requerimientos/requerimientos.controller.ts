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
import type { Request } from 'express';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { RequerimientosService } from './requerimientos.service.js';
import { CreateRequerimientoDto } from './dto/create-requerimiento.dto.js';
import { UpdateRequerimientoDto } from './dto/update-requerimiento.dto.js';
import { QueryRequerimientoDto } from './dto/query-requerimiento.dto.js';
import { ObservarRequerimientoDto } from './dto/revisar-requerimiento.dto.js';

@Controller('requerimientos')
@Roles(
  'supervisor', 'supervisor_civil', 'supervisor_electrico', 'pdr',
  'ing_civil', 'ing_electrico', 'jefe_sig',
  'logistica', 'gerencia', 'administrador',
)
export class RequerimientosController {
  constructor(private service: RequerimientosService) {}

  @Get()
  findAll(@Query() query: QueryRequerimientoDto, @Req() req: Request) {
    return this.service.findAll(query, req.user!.id, req.user!.role);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateRequerimientoDto, @Req() req: Request) {
    return this.service.create(dto, req.user!.id, req.user!.role);
  }

  @Patch(':id')
  actualizar(@Param('id') id: string, @Body() dto: UpdateRequerimientoDto, @Req() req: Request) {
    return this.service.actualizar(id, dto, req.user!.id, req.user!.role);
  }

  @Post(':id/enviar')
  enviar(@Param('id') id: string, @Req() req: Request) {
    return this.service.enviar(id, req.user!.id, req.user!.role);
  }

  // Approver roles vary by tipo — the service validates the match
  @Post(':id/aprobar')
  @Roles('ing_civil', 'ing_electrico', 'jefe_sig', 'logistica', 'administrador')
  aprobar(@Param('id') id: string, @Req() req: Request) {
    return this.service.aprobar(id, req.user!.id, req.user!.role);
  }

  @Post(':id/observar')
  @Roles('ing_civil', 'ing_electrico', 'jefe_sig', 'logistica', 'administrador')
  observar(@Param('id') id: string, @Body() dto: ObservarRequerimientoDto, @Req() req: Request) {
    return this.service.observar(id, dto, req.user!.id, req.user!.role);
  }
}
