import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { DashboardService } from './dashboard.service.js';

@Controller('dashboard')
@Roles(
  'supervisor',
  'logistica',
  'gerencia',
  'administrador',
  'ing_civil',
  'ing_electrico',
  'jefe_sig',
)
export class DashboardController {
  constructor(private service: DashboardService) {}

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
