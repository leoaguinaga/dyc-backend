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
import { InventarioService } from './inventario.service.js';
import { CreateItemDto } from './dto/create-item.dto.js';
import { UpdateItemDto } from './dto/update-item.dto.js';
import { QueryItemDto } from './dto/query-item.dto.js';

@Controller('inventario')
@Roles('administrador', 'logistica')
export class InventarioController {
  constructor(private inventarioService: InventarioService) {}

  @Get()
  findAll(@Query() query: QueryItemDto) {
    return this.inventarioService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.inventarioService.findOne(id);
  }

  @Post()
  @Roles('administrador', 'logistica')
  create(@Body() dto: CreateItemDto) {
    return this.inventarioService.create(dto);
  }

  @Patch(':id')
  @Roles('administrador', 'logistica')
  update(@Param('id') id: string, @Body() dto: UpdateItemDto) {
    return this.inventarioService.update(id, dto);
  }
}
