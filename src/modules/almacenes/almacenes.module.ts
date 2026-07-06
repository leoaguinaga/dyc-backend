import { Module } from '@nestjs/common';
import { AlmacenesController } from './almacenes.controller.js';
import { AlmacenesService } from './almacenes.service.js';

@Module({
  controllers: [AlmacenesController],
  providers: [AlmacenesService],
})
export class AlmacenesModule {}
