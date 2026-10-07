import { Controller, Get, Param, Query } from '@nestjs/common';
import { ConsolidadoAccesoService } from './consolidado-acceso.service.js';
import { Modulo } from '../../shared/decorators/modulo.decorator.js';

@Controller('asistencias/proyectos/:proyectoId/consolidado-acceso')
@Modulo('asistencia')
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
