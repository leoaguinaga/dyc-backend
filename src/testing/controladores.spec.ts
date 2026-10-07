import { METHOD_METADATA } from '@nestjs/common/constants.js';
import { serviceMock } from './mocks.js';
import { AlmacenesController } from '../modules/almacenes/almacenes.controller.js';
import { AsistenciaGlobalController } from '../modules/asistencias/asistencia-global.controller.js';
import { AsistenciasController } from '../modules/asistencias/asistencias.controller.js';
import { ConsolidadoAccesoController } from '../modules/asistencias/consolidado-acceso.controller.js';
import { ConsolidadoAsistenciaController } from '../modules/asistencias/consolidado-asistencia.controller.js';
import { RegistroVisitaController } from '../modules/asistencias/registro-visita.controller.js';
import { TurnoConfigsController } from '../modules/asistencias/turno-configs.controller.js';
import { VisitaTerceroController } from '../modules/asistencias/visita-tercero.controller.js';
import { AyudaController } from '../modules/ayuda/ayuda.controller.js';
import { ClientesController } from '../modules/clientes/clientes.controller.js';
import { CobrosController } from '../modules/cobros/cobros.controller.js';
import { ComprasSimplesController } from '../modules/compras-simples/compras-simples.controller.js';
import { CotizacionesController } from '../modules/cotizaciones/cotizaciones.controller.js';
import { DashboardController } from '../modules/dashboard/dashboard.controller.js';
import { InventarioController } from '../modules/inventario/inventario.controller.js';
import { NotificacionesController } from '../modules/notificaciones/notificaciones.controller.js';
import { OrdenesCompraController } from '../modules/ordenes-compra/ordenes-compra.controller.js';
import { PagosController } from '../modules/pagos/pagos.controller.js';
import { ProveedoresController } from '../modules/proveedores/proveedores.controller.js';
import { ProyectosController } from '../modules/proyectos/proyectos.controller.js';
import { ReportesController } from '../modules/reportes/reportes.controller.js';
import { RequerimientosController } from '../modules/requerimientos/requerimientos.controller.js';
import { SolicitudesController } from '../modules/solicitudes/solicitudes.controller.js';
import { TrabajadoresController } from '../modules/trabajadores/trabajadores.controller.js';
import { UsersController } from '../modules/users/users.controller.js';

/**
 * Argumento comodín: sirve como id, dto, req (req.user.id), archivo o response.
 * Cualquier propiedad devuelve otro comodín, se puede invocar y convertir a texto.
 */
function comodin(): any {
  const objetivo = function () {};
  const proxy: any = new Proxy(objetivo, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive) return () => '1';
      if (prop === 'then') return undefined;
      if (prop === Symbol.iterator) return function* () {};
      if (prop === 'length') return 0;
      return proxy;
    },
    apply: () => proxy,
  });
  return proxy;
}

const CONTROLADORES = [
  AlmacenesController,
  AsistenciaGlobalController,
  AsistenciasController,
  ConsolidadoAccesoController,
  ConsolidadoAsistenciaController,
  RegistroVisitaController,
  TurnoConfigsController,
  VisitaTerceroController,
  AyudaController,
  ClientesController,
  CobrosController,
  ComprasSimplesController,
  CotizacionesController,
  DashboardController,
  InventarioController,
  NotificacionesController,
  OrdenesCompraController,
  PagosController,
  ProveedoresController,
  ProyectosController,
  ReportesController,
  RequerimientosController,
  SolicitudesController,
  TrabajadoresController,
  UsersController,
];

// Endpoints con lógica propia (catálogo, Excel, PNG): se prueban en el spec de su módulo.
const CON_LOGICA_PROPIA = new Set([
  'PagosController.reportePng',
  'ReportesController.entidades',
  'ReportesController.queryExport',
]);

function endpoints(Clase: new (...args: any[]) => unknown) {
  const proto = Clase.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto).filter(
    (m) =>
      m !== 'constructor' &&
      typeof proto[m] === 'function' &&
      Reflect.getMetadata(METHOD_METADATA, proto[m]) !== undefined &&
      !CON_LOGICA_PROPIA.has(`${Clase.name}.${m}`),
  );
}

describe.each(CONTROLADORES.map((c) => [c.name, c] as const))(
  '%s',
  (_nombre, Clase) => {
    const paramtypes: unknown[] =
      Reflect.getMetadata('design:paramtypes', Clase) ?? [];

    it.each(endpoints(Clase))('%s delega en un servicio', async (metodo) => {
      const servicios = paramtypes.map(() => serviceMock());
      const controller: any = new (Clase as any)(...servicios);
      const args = Array.from(
        { length: controller[metodo].length + 1 },
        comodin,
      );
      await controller[metodo](...args);
      const llamados = servicios.flatMap((s: any) =>
        Object.values(s).filter((f: any) => f.mock?.calls.length),
      );
      expect(llamados.length).toBeGreaterThan(0);
    });
  },
);
