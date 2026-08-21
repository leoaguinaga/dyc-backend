import { Module } from '@nestjs/common';
import { AyudaController } from './ayuda.controller.js';
import { AyudaService } from './ayuda.service.js';

@Module({
  controllers: [AyudaController],
  providers: [AyudaService],
})
export class AyudaModule {}
