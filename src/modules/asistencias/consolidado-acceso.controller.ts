import { Controller, Get, Param, Query } from '@nestjs/common';
import { ConsolidadoAccesoService } from './consolidado-acceso.service.js';

@Controller('asistencias/proyectos/:proyectoId/consolidado-acceso')
export class ConsolidadoAccesoController {
  constructor(private consolidadoService: ConsolidadoAccesoService) {}

  @Get()
  consolidado(
    @Param('proyectoId') proyectoId: string,
    @Query('fecha') fecha?: string,
  ) {
    return this.consolidadoService.consolidado({
      proyectoId,
      desde: fecha,
      hasta: fecha,
    });
  }
}
