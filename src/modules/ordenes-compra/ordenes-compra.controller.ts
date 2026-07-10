import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { OrdenesCompraService } from './ordenes-compra.service.js';
import { CreateOrdenCompraDto, UpdateOrdenCompraDto } from './dto/create-orden.dto.js';
import { CreateOrdenItemDto, UpdateOrdenItemDto } from './dto/orden-item.dto.js';
import type { EstadoOrdenCompra } from '../../../prisma/generated/prisma/enums.js';

@Controller('ordenes-compra')
@Roles('logistica', 'gerencia', 'administrador')
export class OrdenesCompraController {
  constructor(private service: OrdenesCompraService) {}

  @Get()
  findAll(
    @Query('estado') estado?: EstadoOrdenCompra,
    @Query('proyectoId') proyectoId?: string,
  ) {
    return this.service.findAll({ estado, proyectoId });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles('administrador', 'logistica', 'gerencia')
  create(@Body() dto: CreateOrdenCompraDto, @Req() req: Request) {
    return this.service.create(dto, req.user!.id);
  }

  @Patch(':id')
  @Roles('administrador', 'logistica', 'gerencia')
  update(@Param('id') id: string, @Body() dto: UpdateOrdenCompraDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/items')
  @Roles('administrador', 'logistica', 'gerencia')
  addItem(@Param('id') id: string, @Body() dto: CreateOrdenItemDto) {
    return this.service.addItem(id, dto);
  }

  @Patch(':id/items/:itemId')
  @Roles('administrador', 'logistica', 'gerencia')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateOrdenItemDto,
  ) {
    return this.service.updateItem(id, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  @Roles('administrador', 'logistica', 'gerencia')
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.service.removeItem(id, itemId);
  }

  @Post(':id/emitir')
  @Roles('administrador', 'logistica', 'gerencia')
  emitir(@Param('id') id: string) {
    return this.service.transicionEstado(id, 'emitida');
  }

  @Post(':id/recibir-parcial')
  @Roles('administrador', 'logistica', 'gerencia')
  recibirParcial(@Param('id') id: string) {
    return this.service.transicionEstado(id, 'recibida_parcial');
  }

  @Post(':id/recibir')
  @Roles('administrador', 'logistica', 'gerencia')
  recibir(@Param('id') id: string) {
    return this.service.transicionEstado(id, 'recibida');
  }

  @Post(':id/cancelar')
  @Roles('administrador', 'logistica', 'gerencia')
  cancelar(@Param('id') id: string) {
    return this.service.transicionEstado(id, 'cancelada');
  }
}
