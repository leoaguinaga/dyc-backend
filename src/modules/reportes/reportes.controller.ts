import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { ReportesService } from './reportes.service.js';
import { QueryReporteRangoDto } from './dto/query-reporte.dto.js';

@Controller('reportes')
@Roles('gerencia', 'administrador')
export class ReportesController {
  constructor(private service: ReportesService) {}

  @Get('gasto-por-proyecto')
  gastoPorProyecto(@Query() query: QueryReporteRangoDto) {
    return this.service.gastoPorProyecto(query);
  }

  @Get('ocs-por-proveedor')
  ocsPorProveedor(@Query() query: QueryReporteRangoDto) {
    return this.service.ocsPorProveedor(query);
  }

  @Get('pagos-por-periodo')
  pagosPorPeriodo(@Query() query: QueryReporteRangoDto) {
    return this.service.pagosPorPeriodo(query);
  }
}
