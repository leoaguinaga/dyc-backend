import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { StorageModule } from '../../shared/storage/storage.module.js';
import { PagosController } from './pagos.controller.js';
import { PagosService } from './pagos.service.js';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [PagosController],
  providers: [PagosService],
})
export class PagosModule {}
