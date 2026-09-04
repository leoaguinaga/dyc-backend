import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { DashboardService } from './dashboard.service.js';

@Controller('dashboard')
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
export class DashboardController {
  constructor(private service: DashboardService) {}

  @Get('inicio')
  inicio(@Req() req: Request) {
    return this.service.inicio(req.user!);
  }

  @Get('resumen')
  resumen() {
    return this.service.resumen();
  }

  @Get('finanzas')
  @Roles('gerencia', 'administrador')
  finanzas() {
    return this.service.finanzas();
  }
}
