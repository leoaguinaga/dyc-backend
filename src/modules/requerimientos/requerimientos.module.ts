import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { StorageModule } from '../../shared/storage/storage.module.js';
import { RequerimientosController } from './requerimientos.controller.js';
import { RequerimientosService } from './requerimientos.service.js';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [RequerimientosController],
  providers: [RequerimientosService],
})
export class RequerimientosModule {}
