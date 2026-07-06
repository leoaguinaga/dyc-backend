import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { TrabajadoresService } from './trabajadores.service.js';
import { CreateTrabajadorDto } from './dto/create-trabajador.dto.js';
import { UpdateTrabajadorDto } from './dto/update-trabajador.dto.js';
import { AsignarProyectoDto } from './dto/asignar-proyecto.dto.js';
import { CrearAccesoDto } from './dto/crear-acceso.dto.js';

@Controller('trabajadores')
@Roles('administrador', 'logistica')
export class TrabajadoresController {
  constructor(private trabajadoresService: TrabajadoresService) {}

  @Get()
  findAll() {
    return this.trabajadoresService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.trabajadoresService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateTrabajadorDto) {
    return this.trabajadoresService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTrabajadorDto) {
    return this.trabajadoresService.update(id, dto);
  }

  @Post(':id/acceso')
  crearAcceso(@Param('id') id: string, @Body() dto: CrearAccesoDto) {
    return this.trabajadoresService.crearAcceso(id, dto);
  }

  @Patch(':id/eliminar')
  softDelete(@Param('id') id: string) {
    return this.trabajadoresService.softDelete(id);
  }

  @Post(':id/proyectos')
  asignarProyecto(@Param('id') id: string, @Body() dto: AsignarProyectoDto) {
    return this.trabajadoresService.asignarProyecto(id, dto);
  }

  @Delete(':id/proyectos/:proyectoId')
  desasignarProyecto(
    @Param('id') id: string,
    @Param('proyectoId') proyectoId: string,
  ) {
    return this.trabajadoresService.desasignarProyecto(id, proyectoId);
  }
}
