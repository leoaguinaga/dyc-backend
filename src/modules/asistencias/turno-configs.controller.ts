import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { TurnoConfigsService } from './turno-configs.service.js';
import { CreateTurnoConfigDto } from './dto/create-turno-config.dto.js';
import { UpdateTurnoConfigDto } from './dto/update-turno-config.dto.js';
import { Roles } from '../../shared/decorators/roles.decorator.js';

@Controller('asistencias/proyectos/:proyectoId/turno-configs')
export class TurnoConfigsController {
  constructor(private turnoConfigsService: TurnoConfigsService) {}

  @Get()
  findAll(@Param('proyectoId') proyectoId: string) {
    return this.turnoConfigsService.findAll(proyectoId);
  }

  @Get(':turnoConfigId')
  findOne(
    @Param('proyectoId') proyectoId: string,
    @Param('turnoConfigId') turnoConfigId: string,
  ) {
    return this.turnoConfigsService.findOne(proyectoId, turnoConfigId);
  }

  @Post()
  @Roles('administrador', 'gerencia')
  create(
    @Param('proyectoId') proyectoId: string,
    @Body() dto: CreateTurnoConfigDto,
  ) {
    return this.turnoConfigsService.create(proyectoId, dto);
  }

  @Patch(':turnoConfigId')
  @Roles('administrador', 'gerencia')
  update(
    @Param('proyectoId') proyectoId: string,
    @Param('turnoConfigId') turnoConfigId: string,
    @Body() dto: UpdateTurnoConfigDto,
  ) {
    return this.turnoConfigsService.update(proyectoId, turnoConfigId, dto);
  }

  @Delete(':turnoConfigId')
  @Roles('administrador', 'gerencia')
  desactivar(
    @Param('proyectoId') proyectoId: string,
    @Param('turnoConfigId') turnoConfigId: string,
  ) {
    return this.turnoConfigsService.desactivar(proyectoId, turnoConfigId);
  }
}
