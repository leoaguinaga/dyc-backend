import { Module } from '@nestjs/common';
import { OrdenesCompraController } from './ordenes-compra.controller.js';
import { OrdenesCompraService } from './ordenes-compra.service.js';

@Module({
  controllers: [OrdenesCompraController],
  providers: [OrdenesCompraService],
})
export class OrdenesCompraModule {}
