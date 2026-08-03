import { Module } from '@nestjs/common';
import { StorageModule } from '../../shared/storage/storage.module.js';
import { AsistenciasController } from './asistencias.controller.js';
import { AsistenciasService } from './asistencias.service.js';
import { RegistroVisitaController } from './registro-visita.controller.js';
import { RegistroVisitaService } from './registro-visita.service.js';
import { VisitaTerceroController } from './visita-tercero.controller.js';
import { VisitaTerceroService } from './visita-tercero.service.js';
import { ConsolidadoAccesoController } from './consolidado-acceso.controller.js';
import { ConsolidadoAccesoService } from './consolidado-acceso.service.js';
import { ConsolidadoAsistenciaController } from './consolidado-asistencia.controller.js';
import { ConsolidadoAsistenciaService } from './consolidado-asistencia.service.js';
import { AsistenciaGlobalController } from './asistencia-global.controller.js';
import { JornadaGlobalService } from './jornada-global.service.js';
import { TurnoConfigsController } from './turno-configs.controller.js';
import { TurnoConfigsService } from './turno-configs.service.js';

@Module({
  imports: [StorageModule],
  controllers: [
    AsistenciasController,
    RegistroVisitaController,
    VisitaTerceroController,
    ConsolidadoAccesoController,
    ConsolidadoAsistenciaController,
    AsistenciaGlobalController,
    TurnoConfigsController,
  ],
  providers: [
    AsistenciasService,
    RegistroVisitaService,
    VisitaTerceroService,
    ConsolidadoAccesoService,
    ConsolidadoAsistenciaService,
    JornadaGlobalService,
    TurnoConfigsService,
  ],
})
export class AsistenciasModule {}
