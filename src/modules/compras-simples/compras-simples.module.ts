import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { StorageModule } from '../../shared/storage/storage.module.js';
import { ComprasSimplesController } from './compras-simples.controller.js';
import { ComprasSimplesService } from './compras-simples.service.js';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [ComprasSimplesController],
  providers: [ComprasSimplesService],
})
export class ComprasSimplesModule {}
