import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { CobrosService } from './cobros.service.js';
import { MarcarCobradoDto, QueryCobrosDto } from './dto/marcar-cobrado.dto.js';

@Controller('cobros')
@Roles('administrador', 'gerencia')
export class CobrosController {
  constructor(private service: CobrosService) {}

  @Get()
  findAll(@Query() query: QueryCobrosDto) {
    return this.service.findAll(query);
  }

  @Get('resumen')
  resumen() {
    return this.service.resumen();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/marcar-cobrado')
  marcarCobrado(@Param('id') id: string, @Body() dto: MarcarCobradoDto, @Req() req: Request) {
    return this.service.marcarCobrado(id, dto, req.user!.id);
  }
}
