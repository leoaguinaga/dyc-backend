import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { ReportesService } from './reportes.service.js';
import { ReportesQueryService } from './reportes-query.service.js';
import { QueryReporteRangoDto } from './dto/query-reporte.dto.js';
import { QueryReporteDinamicoDto } from './dto/query-reporte-dinamico.dto.js';
import { CATALOGO_REPORTES } from './catalogo/index.js';
import { PRESETS_REPORTES } from './catalogo/presets.js';
import { construirWorkbookReporte } from './reportes-excel.builder.js';

@Controller('reportes')
@Roles('gerencia', 'administrador')
export class ReportesController {
  constructor(
    private service: ReportesService,
    private queryService: ReportesQueryService,
  ) {}

  @Get('entidades')
  entidades() {
    const catalogo = Object.fromEntries(
      Object.entries(CATALOGO_REPORTES).map(([entidad, meta]) => [
        entidad,
        { entidad: meta.entidad, label: meta.label, campos: meta.campos, campoFechaDefault: meta.campoFechaDefault },
      ]),
    );
    return { entidades: catalogo, presets: PRESETS_REPORTES };
  }

  @Post('query')
  query(@Body() dto: QueryReporteDinamicoDto) {
    return this.queryService.ejecutar(dto);
  }

  @Post('query/export')
  async queryExport(@Body() dto: QueryReporteDinamicoDto, @Res() res: Response) {
    const resultado = await this.queryService.ejecutar(dto);
    const buffer = await construirWorkbookReporte(resultado);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="reporte.xlsx"',
    });
    res.send(buffer);
  }

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
