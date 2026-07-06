import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { ProyectosModule } from './modules/proyectos/proyectos.module.js';
import { TrabajadoresModule } from './modules/trabajadores/trabajadores.module.js';
import { ProveedoresModule } from './modules/proveedores/proveedores.module.js';
import { ClientesModule } from './modules/clientes/clientes.module.js';
import { InventarioModule } from './modules/inventario/inventario.module.js';
import { AlmacenesModule } from './modules/almacenes/almacenes.module.js';
import { CotizacionesModule } from './modules/cotizaciones/cotizaciones.module.js';
import { RequerimientosModule } from './modules/requerimientos/requerimientos.module.js';
import { OrdenesCompraModule } from './modules/ordenes-compra/ordenes-compra.module.js';
import { PagosModule } from './modules/pagos/pagos.module.js';
import { ReportesModule } from './modules/reportes/reportes.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { AuthGuard } from './shared/guards/auth.guard.js';
import { RolesGuard } from './shared/guards/roles.guard.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
    EventEmitterModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    ProyectosModule,
    TrabajadoresModule,
    ProveedoresModule,
    ClientesModule,
    InventarioModule,
    AlmacenesModule,
    CotizacionesModule,
    RequerimientosModule,
    OrdenesCompraModule,
    PagosModule,
    ReportesModule,
    DashboardModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
