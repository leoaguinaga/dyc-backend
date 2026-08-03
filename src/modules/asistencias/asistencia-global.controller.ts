import { Controller, Get, Param, Query } from '@nestjs/common';
import { ConsolidadoAccesoService } from './consolidado-acceso.service.js';
import { ConsolidadoAsistenciaService } from './consolidado-asistencia.service.js';
import { JornadaGlobalService } from './jornada-global.service.js';
import {
  ControlAccesoGlobalQueryDto,
  PlanillasGlobalQueryDto,
} from './dto/asistencia-global-query.dto.js';
import { Roles } from '../../shared/decorators/roles.decorator.js';

@Controller('asistencias')
@Roles('administrador', 'gerencia')
export class AsistenciaGlobalController {
  constructor(
    private consolidadoAcceso: ConsolidadoAccesoService,
    private consolidadoAsistencia: ConsolidadoAsistenciaService,
    private jornadaGlobal: JornadaGlobalService,
  ) {}

  @Get('jornadas')
  listarJornadas(@Query() query: PlanillasGlobalQueryDto) {
    return this.jornadaGlobal.listarJornadas(query);
  }

  @Get('jornadas/:turnoId')
  obtenerJornada(@Param('turnoId') turnoId: string) {
    return this.jornadaGlobal.obtenerJornada(turnoId);
  }

  @Get('control-acceso')
  controlAccesoGlobal(@Query() query: ControlAccesoGlobalQueryDto) {
    return this.consolidadoAcceso.consolidado(query);
  }

  @Get('planillas')
  planillasGlobal(@Query() query: PlanillasGlobalQueryDto) {
    return this.consolidadoAsistencia.listarPlanillasGlobal(query);
  }
}
