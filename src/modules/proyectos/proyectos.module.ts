import { Module } from '@nestjs/common';
import { StorageModule } from '../../shared/storage/storage.module.js';
import { ProyectosController } from './proyectos.controller.js';
import { ProyectosService } from './proyectos.service.js';

@Module({
  imports: [StorageModule],
  controllers: [ProyectosController],
  providers: [ProyectosService],
})
export class ProyectosModule {}
