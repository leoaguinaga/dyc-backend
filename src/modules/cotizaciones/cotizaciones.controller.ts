import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { CotizacionesService } from './cotizaciones.service.js';
import { CreateSolicitudDto } from './dto/create-solicitud.dto.js';
import { UpdateSolicitudDto } from './dto/update-solicitud.dto.js';
import {
  AdjudicarSolicitudDto,
  AttachArchivoDto,
  CreateCotizacionDto,
  ReceiveCotizacionDto,
} from './dto/create-cotizacion.dto.js';
import { QuerySolicitudDto } from './dto/query-solicitud.dto.js';
import { QueryHistorialDto } from './dto/query-historial.dto.js';

const MAX_ARCHIVO_BYTES = 10 * 1024 * 1024;

@Controller('solicitudes-cotizacion')
@Roles(
  'administrador',
  'logistica',
  'gerencia',
  'ing_civil',
  'ing_electrico',
  'jefe_sig',
)
export class CotizacionesController {
  constructor(private cotizacionesService: CotizacionesService) {}

  // ── Solicitudes ───────────────────────────────────────────────────────────

  @Get()
  findAll(@Query() query: QuerySolicitudDto) {
    return this.cotizacionesService.findAllSolicitudes(query);
  }

  @Get('historial')
  findHistorial(@Query() query: QueryHistorialDto) {
    return this.cotizacionesService.findHistorialSolicitudes(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cotizacionesService.findOneSolicitud(id);
  }

  @Post()
  @Roles('administrador', 'logistica', 'gerencia')
  create(@Body() dto: CreateSolicitudDto) {
    return this.cotizacionesService.createSolicitud(dto);
  }

  @Patch(':id')
  @Roles('administrador', 'logistica', 'gerencia')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSolicitudDto,
    @Req() req: Request,
  ) {
    return this.cotizacionesService.updateSolicitud(id, dto, {
      id: req.user!.id,
      role: req.user!.role,
    });
  }

  // ── Cotizaciones (anidadas bajo solicitud) ────────────────────────────────

  @Post(':id/cotizaciones')
  @Roles('administrador', 'logistica', 'gerencia')
  inviteProveedor(
    @Param('id') id: string,
    @Body() dto: CreateCotizacionDto,
    @Req() req: Request,
  ) {
    return this.cotizacionesService.inviteProveedor(id, dto, {
      id: req.user!.id,
      role: req.user!.role,
    });
  }

  // ── Cotizacion individual (estado) ────────────────────────────────────────

  @Post('cotizaciones/archivos')
  @UseInterceptors(
    FileInterceptor('archivo', {
      limits: { fileSize: MAX_ARCHIVO_BYTES },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          cb(new BadRequestException('Solo se permiten archivos PDF'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  subirArchivo(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Debes adjuntar un archivo PDF');
    return this.cotizacionesService.subirArchivo(file);
  }

  @Post('cotizaciones/:cotizacionId/archivos')
  attachArchivo(
    @Param('cotizacionId') cotizacionId: string,
    @Body() dto: AttachArchivoDto,
  ) {
    return this.cotizacionesService.attachArchivo(cotizacionId, dto);
  }

  @Patch('cotizaciones/:cotizacionId/recibir')
  @Roles('administrador', 'logistica', 'gerencia')
  receive(
    @Param('cotizacionId') cotizacionId: string,
    @Body() dto: ReceiveCotizacionDto,
    @Req() req: Request,
  ) {
    return this.cotizacionesService.receiveCotizacion(cotizacionId, dto, {
      id: req.user!.id,
      role: req.user!.role,
    });
  }

  @Patch('cotizaciones/:cotizacionId/aprobar')
  @Roles('administrador', 'gerencia')
  approve(@Param('cotizacionId') cotizacionId: string) {
    return this.cotizacionesService.aprobarCotizacion(cotizacionId);
  }

  @Patch('cotizaciones/:cotizacionId/sin-respuesta')
  @Roles('administrador', 'logistica', 'gerencia')
  markSinRespuesta(@Param('cotizacionId') cotizacionId: string) {
    return this.cotizacionesService.marcarSinRespuesta(cotizacionId);
  }

  @Patch(':id/adjudicar')
  @Roles('administrador', 'logistica', 'gerencia')
  adjudicar(@Param('id') id: string, @Body() dto: AdjudicarSolicitudDto) {
    return this.cotizacionesService.adjudicarSolicitud(id, dto);
  }

  @Post(':id/aprobar-solicitante')
  @Roles(
    'administrador',
    'logistica',
    'gerencia',
    'supervisor',
    'supervisor_civil',
    'supervisor_electrico',
    'pdr',
  )
  aprobarSolicitante(@Param('id') id: string, @Req() req: Request) {
    return this.cotizacionesService.avanzarEstadoSolicitud(
      id,
      'aprobada_solicitante',
      { id: req.user!.id, role: req.user!.role },
    );
  }

  @Post(':id/aprobar-gerencia')
  @Roles('administrador', 'gerencia')
  aprobarGerencia(@Param('id') id: string, @Req() req: Request) {
    return this.cotizacionesService.avanzarEstadoSolicitud(
      id,
      'aprobada_gerencia',
      { id: req.user!.id, role: req.user!.role },
    );
  }

  @Post(':id/cancelar')
  @Roles('administrador', 'logistica', 'gerencia')
  cancelar(@Param('id') id: string, @Req() req: Request) {
    return this.cotizacionesService.avanzarEstadoSolicitud(id, 'cancelada', {
      id: req.user!.id,
      role: req.user!.role,
    });
  }
}
