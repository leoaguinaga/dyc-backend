import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { ProyectosService } from './proyectos.service.js';
import { CreateProyectoDto } from './dto/create-proyecto.dto.js';
import { UpdateProyectoDto } from './dto/update-proyecto.dto.js';
import { CreateHitoDto } from './dto/create-hito.dto.js';
import { UpdateHitoDto } from './dto/update-hito.dto.js';
import { AsignarTrabajadoresDto } from './dto/asignar-trabajadores.dto.js';
import { CerrarProyectoDto } from './dto/cerrar-proyecto.dto.js';
import type { AuthenticatedUser } from '../../shared/guards/auth.guard.js';

const MAX_ACTA_BYTES = 10 * 1024 * 1024;
const ACTA_MIME_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png'];

type AuthRequest = Request & { user: AuthenticatedUser };

@Controller('proyectos')
export class ProyectosController {
  constructor(private proyectosService: ProyectosService) {}

  @Get()
  findAll(@Req() req: AuthRequest, @Query('todos') todos?: string) {
    return this.proyectosService.findAll(req.user.id, req.user.role, todos === '1');
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.proyectosService.findOne(id, req.user.id, req.user.role);
  }

  @Post()
  @Roles('administrador', 'gerencia')
  create(@Body() dto: CreateProyectoDto) {
    return this.proyectosService.create(dto);
  }

  @Patch(':id')
  @Roles('administrador', 'gerencia')
  update(@Param('id') id: string, @Body() dto: UpdateProyectoDto) {
    return this.proyectosService.update(id, dto);
  }

  @Patch(':id/cerrar')
  @Roles('administrador', 'gerencia')
  cerrar(
    @Param('id') id: string,
    @Body() dto: CerrarProyectoDto,
    @Req() req: AuthRequest,
  ) {
    return this.proyectosService.cerrar(id, req.user.id, dto);
  }

  @Post('acta-conformidad')
  @Roles('administrador', 'gerencia')
  @UseInterceptors(
    FileInterceptor('archivo', {
      limits: { fileSize: MAX_ACTA_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!ACTA_MIME_PERMITIDOS.includes(file.mimetype)) {
          cb(new BadRequestException('Formato no permitido (usa PDF, JPG o PNG)'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  subirActaConformidad(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Debes adjuntar un archivo');
    return this.proyectosService.subirActaConformidad(file);
  }

  @Post(':id/supervisores/:userId')
  @Roles('administrador', 'gerencia')
  addSupervisor(@Param('id') id: string, @Param('userId') userId: string) {
    return this.proyectosService.addSupervisor(id, userId);
  }

  @Delete(':id/supervisores/:userId')
  @Roles('administrador', 'gerencia')
  removeSupervisor(@Param('id') id: string, @Param('userId') userId: string) {
    return this.proyectosService.removeSupervisor(id, userId);
  }

  // ── Trabajadores ──────────────────────────────────────────────────────────

  @Post(':id/trabajadores')
  @Roles('administrador', 'gerencia', 'logistica')
  asignarTrabajadores(
    @Param('id') id: string,
    @Body() dto: AsignarTrabajadoresDto,
  ) {
    return this.proyectosService.asignarTrabajadores(id, dto);
  }

  // ── Hitos ──────────────────────────────────────────────────────────────────

  @Get(':id/hitos')
  findHitos(@Param('id') id: string) {
    return this.proyectosService.findHitos(id);
  }

  @Post(':id/hitos')
  @Roles('administrador', 'gerencia')
  createHito(@Param('id') id: string, @Body() dto: CreateHitoDto) {
    return this.proyectosService.createHito(id, dto);
  }

  @Patch(':id/hitos/:hitoId')
  @Roles('administrador', 'gerencia')
  updateHito(
    @Param('id') id: string,
    @Param('hitoId') hitoId: string,
    @Body() dto: UpdateHitoDto,
  ) {
    return this.proyectosService.updateHito(id, hitoId, dto);
  }

  @Delete(':id/hitos/:hitoId')
  @Roles('administrador', 'gerencia')
  deleteHito(@Param('id') id: string, @Param('hitoId') hitoId: string) {
    return this.proyectosService.deleteHito(id, hitoId);
  }
}
