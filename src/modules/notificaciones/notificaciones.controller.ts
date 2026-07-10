import { Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { NotificacionesService } from './notificaciones.service.js';
import { QueryNotificacionDto } from './dto/query-notificacion.dto.js';

@Controller('notificaciones')
export class NotificacionesController {
  constructor(private service: NotificacionesService) {}

  @Get()
  findAllMine(@Query() query: QueryNotificacionDto, @Req() req: Request) {
    return this.service.findAllMine(req.user!.id, query);
  }

  @Get('no-leidas/count')
  countNoLeidas(@Req() req: Request) {
    return this.service.countNoLeidas(req.user!.id);
  }

  @Patch(':id/leer')
  marcarLeida(@Param('id') id: string, @Req() req: Request) {
    return this.service.marcarLeida(id, req.user!.id);
  }

  @Post('leer-todas')
  marcarTodasLeidas(@Req() req: Request) {
    return this.service.marcarTodasLeidas(req.user!.id);
  }
}
