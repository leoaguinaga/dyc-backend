import { Module } from '@nestjs/common';
import { ProyectosController } from './proyectos.controller.js';
import { ProyectosService } from './proyectos.service.js';

@Module({
  controllers: [ProyectosController],
  providers: [ProyectosService],
})
export class ProyectosModule {}
