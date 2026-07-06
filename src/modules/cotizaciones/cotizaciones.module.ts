import { Module } from '@nestjs/common';
import { CotizacionesController } from './cotizaciones.controller.js';
import { CotizacionesService } from './cotizaciones.service.js';

@Module({
  controllers: [CotizacionesController],
  providers: [CotizacionesService],
})
export class CotizacionesModule {}
