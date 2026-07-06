import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { AlmacenesService } from './almacenes.service.js';
import { CreateAlmacenDto } from './dto/create-almacen.dto.js';

@Controller('almacenes')
@Roles('administrador', 'logistica', 'gerencia')
export class AlmacenesController {
  constructor(private almacenesService: AlmacenesService) {}

  @Get()
  findAll() {
    return this.almacenesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.almacenesService.findOne(id);
  }

  @Post()
  @Roles('administrador')
  create(@Body() dto: CreateAlmacenDto) {
    return this.almacenesService.create(dto);
  }
}
