import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { TrabajadoresController } from './trabajadores.controller.js';
import { TrabajadoresService } from './trabajadores.service.js';

@Module({
  imports: [AuthModule],
  controllers: [TrabajadoresController],
  providers: [TrabajadoresService],
})
export class TrabajadoresModule {}
