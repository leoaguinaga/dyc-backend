import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PagosController } from './pagos.controller.js';
import { PagosService } from './pagos.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [PagosController],
  providers: [PagosService],
})
export class PagosModule {}
