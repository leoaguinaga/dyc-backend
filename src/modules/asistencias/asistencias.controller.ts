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
import { Request } from 'express';
import { AsistenciasService, FOTO_MIME_TYPES } from './asistencias.service.js';
import { CreateTurnoDto } from './dto/create-turno.dto.js';
import { RegistrarAsistenciaDto } from './dto/registrar-asistencia.dto.js';
import { OmitirFotoDto } from './dto/omitir-foto.dto.js';
import { CerrarTurnoDto } from './dto/cerrar-turno.dto.js';
import { RevisarCierreDto } from './dto/revisar-cierre.dto.js';
import { RegistrarDesdeHojaDto } from './dto/registrar-desde-hoja.dto.js';
import { ReabrirTurnoDto } from './dto/reabrir-turno.dto.js';
import { EditarHorarioTurnoDto } from './dto/editar-horario-turno.dto.js';
import { RequireResponsableAsistencia } from '../../shared/decorators/require-responsable-asistencia.decorator.js';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../../shared/guards/auth.guard.js';

type AuthRequest = Request & { user: AuthenticatedUser };

const MAX_FOTO_BYTES = 15 * 1024 * 1024;

@Controller('asistencias/proyectos/:proyectoId/turnos')
export class AsistenciasController {
  constructor(private asistenciasService: AsistenciasService) {}

  @Get()
  findAll(@Param('proyectoId') proyectoId: string) {
    return this.asistenciasService.findTurnos(proyectoId);
  }

  // Oficina carga una jornada completa desde la hoja física firmada.
  @Post('desde-hoja')
  @Roles('administrador', 'gerencia', 'jefe_sig')
  registrarDesdeHoja(
    @Param('proyectoId') proyectoId: string,
    @Body() dto: RegistrarDesdeHojaDto,
    @Req() req: AuthRequest,
  ) {
    return this.asistenciasService.registrarDesdeHoja(
      proyectoId,
      req.user.id,
      dto,
    );
  }

  @Get('obreros-para-hoja')
  @Roles('administrador', 'gerencia', 'jefe_sig')
  obrerosParaHoja(
    @Param('proyectoId') proyectoId: string,
    @Query('fecha') fecha: string,
    @Query('turnoConfigId') turnoConfigId: string,
  ) {
    if (!fecha || !turnoConfigId) {
      throw new BadRequestException('Indica fecha y horario');
    }
    return this.asistenciasService.obrerosParaHoja(
      proyectoId,
      fecha,
      turnoConfigId,
    );
  }

  @Get(':turnoId')
  findOne(
    @Param('proyectoId') proyectoId: string,
    @Param('turnoId') turnoId: string,
  ) {
    return this.asistenciasService.findTurnoDetalle(proyectoId, turnoId);
  }

  @Post()
  @RequireResponsableAsistencia()
  abrir(
    @Param('proyectoId') proyectoId: string,
    @Body() dto: CreateTurnoDto,
    @Req() req: AuthRequest,
  ) {
    return this.asistenciasService.abrirTurno(
      proyectoId,
      req.user.id,
      req.user.role,
      dto,
    );
  }

  @Patch(':turnoId/asistencias')
  @RequireResponsableAsistencia()
  registrarAsistencias(
    @Param('proyectoId') proyectoId: string,
    @Param('turnoId') turnoId: string,
    @Body() dto: RegistrarAsistenciaDto,
  ) {
    return this.asistenciasService.registrarAsistencias(
      proyectoId,
      turnoId,
      dto,
    );
  }

  @Post(':turnoId/foto')
  @RequireResponsableAsistencia()
  @UseInterceptors(
    FileInterceptor('foto', {
      limits: { fileSize: MAX_FOTO_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!FOTO_MIME_TYPES.includes(file.mimetype)) {
          cb(
            new BadRequestException(
              'Solo se permiten imágenes JPG, PNG o WebP',
            ),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  subirFoto(
    @Param('proyectoId') proyectoId: string,
    @Param('turnoId') turnoId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Debes adjuntar una foto');
    return this.asistenciasService.subirFoto(proyectoId, turnoId, file);
  }

  @Patch(':turnoId/omitir-foto')
  @RequireResponsableAsistencia()
  omitirFoto(
    @Param('proyectoId') proyectoId: string,
    @Param('turnoId') turnoId: string,
    @Body() dto: OmitirFotoDto,
  ) {
    return this.asistenciasService.omitirFoto(proyectoId, turnoId, dto);
  }

  @Get(':turnoId/cierre-preview')
  cierrePreview(
    @Param('proyectoId') proyectoId: string,
    @Param('turnoId') turnoId: string,
  ) {
    return this.asistenciasService.previsualizarCierre(proyectoId, turnoId);
  }

  @Patch(':turnoId/cerrar')
  @RequireResponsableAsistencia()
  cerrar(
    @Param('proyectoId') proyectoId: string,
    @Param('turnoId') turnoId: string,
    @Body() dto: CerrarTurnoDto,
    @Req() req: AuthRequest,
  ) {
    return this.asistenciasService.cerrarTurno(
      proyectoId,
      turnoId,
      req.user.id,
      dto,
    );
  }

  @Patch(':turnoId/reabrir')
  @Roles('administrador', 'gerencia')
  reabrir(
    @Param('proyectoId') proyectoId: string,
    @Param('turnoId') turnoId: string,
    @Body() dto: ReabrirTurnoDto,
    @Req() req: AuthRequest,
  ) {
    return this.asistenciasService.reabrirTurno(
      proyectoId,
      turnoId,
      req.user.id,
      dto,
    );
  }

  // Decide qué pasa con las horas extra de una jornada que cerró el sistema.
  @Patch(':turnoId/revisar-cierre')
  @Roles('administrador', 'gerencia', 'jefe_sig')
  revisarCierre(
    @Param('proyectoId') proyectoId: string,
    @Param('turnoId') turnoId: string,
    @Body() dto: RevisarCierreDto,
    @Req() req: AuthRequest,
  ) {
    return this.asistenciasService.revisarCierre(
      proyectoId,
      turnoId,
      req.user.id,
      dto,
    );
  }

  @Patch(':turnoId/horario')
  @RequireResponsableAsistencia()
  editarHorario(
    @Param('proyectoId') proyectoId: string,
    @Param('turnoId') turnoId: string,
    @Body() dto: EditarHorarioTurnoDto,
  ) {
    return this.asistenciasService.editarHorario(proyectoId, turnoId, dto);
  }
}
