import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { NotificacionesController } from './notificaciones.controller.js';
import { NotificacionesService } from './notificaciones.service.js';
import { NotificacionesListener } from './notificaciones.listener.js';

@Module({
  imports: [PrismaModule],
  controllers: [NotificacionesController],
  providers: [NotificacionesService, NotificacionesListener],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
