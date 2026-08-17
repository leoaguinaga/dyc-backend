import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { StorageModule } from '../../shared/storage/storage.module.js';
import { OrdenesCompraModule } from '../ordenes-compra/ordenes-compra.module.js';
import { ComprasSimplesController } from './compras-simples.controller.js';
import { ComprasSimplesService } from './compras-simples.service.js';

@Module({
  imports: [PrismaModule, StorageModule, OrdenesCompraModule],
  controllers: [ComprasSimplesController],
  providers: [ComprasSimplesService],
})
export class ComprasSimplesModule {}
