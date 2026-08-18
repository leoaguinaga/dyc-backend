import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { CobrosController } from './cobros.controller.js';
import { CobrosService } from './cobros.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [CobrosController],
  providers: [CobrosService],
})
export class CobrosModule {}
