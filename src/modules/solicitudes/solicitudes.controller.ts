import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { QuerySolicitudesDto } from './dto/query-solicitudes.dto.js';
import { SolicitudesService } from './solicitudes.service.js';

@Controller('solicitudes')
@Roles(
  'supervisor',
  'supervisor_civil',
  'supervisor_electrico',
  'pdr',
  'logistica',
  'gerencia',
  'administrador',
  'admin_ti',
  'ing_civil',
  'ing_electrico',
  'jefe_sig',
)
export class SolicitudesController {
  constructor(private service: SolicitudesService) {}

  @Get()
  findAll(@Query() query: QuerySolicitudesDto, @Req() req: Request) {
    return this.service.findAll(query, req.user!.id, req.user!.role);
  }
}
