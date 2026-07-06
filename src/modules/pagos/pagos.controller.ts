import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { PagosService } from './pagos.service.js';
import {
  CreatePagoDto,
  MarcarPagadoDto,
  QueryPagosDto,
  UpdatePagoDto,
} from './dto/create-pago.dto.js';

@Controller('pagos')
@Roles('logistica', 'gerencia', 'administrador')
export class PagosController {
  constructor(private service: PagosService) {}

  @Get()
  @Roles('gerencia', 'administrador')
  findAll(@Query() query: QueryPagosDto) {
    return this.service.findAll(query);
  }

  @Get('resumen')
  @Roles('gerencia', 'administrador')
  resumen() {
    return this.service.resumen();
  }

  @Get('orden/:ordenCompraId')
  findByOrden(@Param('ordenCompraId') ordenCompraId: string) {
    return this.service.findByOrden(ordenCompraId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreatePagoDto, @Req() req: Request) {
    return this.service.create(dto, req.user!.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePagoDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/marcar-pagado')
  marcarPagado(@Param('id') id: string, @Body() dto: MarcarPagadoDto, @Req() req: Request) {
    return this.service.marcarPagado(id, dto, req.user!.id);
  }

  @Post(':id/cancelar')
  cancelar(@Param('id') id: string) {
    return this.service.cancelar(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
