import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { RequerimientosController } from './requerimientos.controller.js';
import { RequerimientosService } from './requerimientos.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [RequerimientosController],
  providers: [RequerimientosService],
})
export class RequerimientosModule {}
