import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { ProyectosService } from './proyectos.service.js';
import { CreateProyectoDto } from './dto/create-proyecto.dto.js';
import { UpdateProyectoDto } from './dto/update-proyecto.dto.js';
import { CreateHitoDto } from './dto/create-hito.dto.js';
import { UpdateHitoDto } from './dto/update-hito.dto.js';
import type { AuthenticatedUser } from '../../shared/guards/auth.guard.js';

type AuthRequest = Request & { user: AuthenticatedUser };

@Controller('proyectos')
export class ProyectosController {
  constructor(private proyectosService: ProyectosService) {}

  @Get()
  findAll(@Req() req: AuthRequest) {
    return this.proyectosService.findAll(req.user.id, req.user.role);
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
