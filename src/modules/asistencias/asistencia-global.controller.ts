import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { ConsolidadoAccesoService } from './consolidado-acceso.service.js';
import { ConsolidadoAsistenciaService } from './consolidado-asistencia.service.js';
import { JornadaGlobalService } from './jornada-global.service.js';
import {
  ControlAccesoGlobalQueryDto,
  JornadasQueryDto,
  PlanillasGlobalQueryDto,
} from './dto/asistencia-global-query.dto.js';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../../shared/guards/auth.guard.js';
import { Modulo } from '../../shared/decorators/modulo.decorator.js';

type AuthRequest = Request & { user: AuthenticatedUser };

@Controller('asistencias')
@Roles('administrador', 'gerencia')
@Modulo('asistencia')
export class AsistenciaGlobalController {
  constructor(
    private consolidadoAcceso: ConsolidadoAccesoService,
    private consolidadoAsistencia: ConsolidadoAsistenciaService,
    private jornadaGlobal: JornadaGlobalService,
  ) {}

  // Jefe SIG opera y consulta las jornadas de todas las obras, sin ver tarifas
  // por trabajador. Las planillas y el control de acceso global siguen para
  // administración y gerencia.
  @Get('hoy')
  @Roles('administrador', 'gerencia', 'jefe_sig', 'pdr', 'coordinador_ssoma')
  obrasHoy(@Req() req: AuthRequest) {
    return this.jornadaGlobal.obrasHoy(req.user.id, req.user.role);
  }

  @Get('jornadas-pendientes')
  @Roles('administrador', 'gerencia', 'jefe_sig')
  jornadasPendientes() {
    return this.jornadaGlobal.pendientes();
  }

  @Get('jornadas')
  @Roles('administrador', 'gerencia', 'jefe_sig')
  listarJornadas(@Query() query: JornadasQueryDto) {
    return this.jornadaGlobal.listarJornadas(query);
  }

  @Get('jornadas/:turnoId')
  @Roles('administrador', 'gerencia', 'jefe_sig')
  obtenerJornada(@Param('turnoId') turnoId: string, @Req() req: AuthRequest) {
    return this.jornadaGlobal.obtenerJornada(turnoId, req.user.role);
  }

  @Get('control-acceso')
  controlAccesoGlobal(@Query() query: ControlAccesoGlobalQueryDto) {
    return this.consolidadoAcceso.consolidado(query);
  }

  @Get('planillas')
  @Modulo('planilla')
  @Roles('administrador', 'gerencia', 'tesoreria')
  planillasGlobal(@Query() query: PlanillasGlobalQueryDto) {
    return this.consolidadoAsistencia.listarPlanillasGlobal(query);
  }
}
