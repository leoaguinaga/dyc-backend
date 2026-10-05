import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { RbacService } from './rbac.service.js';
import { RbacController } from './rbac.controller.js';
import { ModulosAccesoController } from './modulos-acceso.controller.js';
import { RutasModuloService } from './rutas-modulo.service.js';

@Module({
  imports: [DiscoveryModule],
  controllers: [RbacController, ModulosAccesoController],
  providers: [RbacService, RutasModuloService],
  exports: [RbacService],
})
export class RbacModule {}
