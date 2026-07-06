import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { CotizacionesService } from './cotizaciones.service.js';
import { CreateSolicitudDto } from './dto/create-solicitud.dto.js';
import { UpdateSolicitudDto } from './dto/update-solicitud.dto.js';
import {
  AdjudicarSolicitudDto,
  CreateCotizacionDto,
  ReceiveCotizacionDto,
} from './dto/create-cotizacion.dto.js';
import { QuerySolicitudDto } from './dto/query-solicitud.dto.js';

@Controller('solicitudes-cotizacion')
@Roles('administrador', 'logistica', 'gerencia')
export class CotizacionesController {
  constructor(private cotizacionesService: CotizacionesService) {}

  // ── Solicitudes ───────────────────────────────────────────────────────────

  @Get()
  findAll(@Query() query: QuerySolicitudDto) {
    return this.cotizacionesService.findAllSolicitudes(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cotizacionesService.findOneSolicitud(id);
  }

  @Post()
  @Roles('administrador', 'logistica')
  create(@Body() dto: CreateSolicitudDto) {
    return this.cotizacionesService.createSolicitud(dto);
  }

  @Patch(':id')
  @Roles('administrador', 'logistica')
  update(@Param('id') id: string, @Body() dto: UpdateSolicitudDto) {
    return this.cotizacionesService.updateSolicitud(id, dto);
  }

  // ── Cotizaciones (anidadas bajo solicitud) ────────────────────────────────

  @Post(':id/cotizaciones')
  @Roles('administrador', 'logistica')
  inviteProveedor(@Param('id') id: string, @Body() dto: CreateCotizacionDto) {
    return this.cotizacionesService.inviteProveedor(id, dto);
  }

  // ── Cotizacion individual (estado) ────────────────────────────────────────

  @Patch('cotizaciones/:cotizacionId/recibir')
  @Roles('administrador', 'logistica')
  receive(
    @Param('cotizacionId') cotizacionId: string,
    @Body() dto: ReceiveCotizacionDto,
  ) {
    return this.cotizacionesService.receiveCotizacion(cotizacionId, dto);
  }

  @Patch('cotizaciones/:cotizacionId/aprobar')
  @Roles('administrador', 'gerencia')
  approve(@Param('cotizacionId') cotizacionId: string) {
    return this.cotizacionesService.aprobarCotizacion(cotizacionId);
  }

  @Patch('cotizaciones/:cotizacionId/sin-respuesta')
  @Roles('administrador', 'logistica')
  markSinRespuesta(@Param('cotizacionId') cotizacionId: string) {
    return this.cotizacionesService.marcarSinRespuesta(cotizacionId);
  }

  @Patch(':id/adjudicar')
  @Roles('administrador', 'logistica')
  adjudicar(@Param('id') id: string, @Body() dto: AdjudicarSolicitudDto) {
    return this.cotizacionesService.adjudicarSolicitud(id, dto);
  }

  @Post(':id/aprobar-solicitante')
  @Roles('administrador', 'logistica')
  aprobarSolicitante(@Param('id') id: string) {
    return this.cotizacionesService.avanzarEstadoSolicitud(id, 'aprobada_solicitante');
  }

  @Post(':id/aprobar-gerencia')
  @Roles('administrador', 'gerencia')
  aprobarGerencia(@Param('id') id: string) {
    return this.cotizacionesService.avanzarEstadoSolicitud(id, 'aprobada_gerencia');
  }

  @Post(':id/cancelar')
  @Roles('administrador', 'logistica', 'gerencia')
  cancelar(@Param('id') id: string) {
    return this.cotizacionesService.avanzarEstadoSolicitud(id, 'cancelada');
  }
}
