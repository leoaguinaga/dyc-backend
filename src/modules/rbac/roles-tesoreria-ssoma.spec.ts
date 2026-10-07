import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import type { Role } from '../../prisma/types.js';
import { RolesGuard } from '../../shared/guards/roles.guard.js';
import { ROLES_CONFIGURABLES } from './modulos.js';
import { PagosController } from '../pagos/pagos.controller.js';
import { ConsolidadoAsistenciaController } from '../asistencias/consolidado-asistencia.controller.js';
import { AsistenciaGlobalController } from '../asistencias/asistencia-global.controller.js';
import { AsistenciasController } from '../asistencias/asistencias.controller.js';
import { RequerimientosController } from '../requerimientos/requerimientos.controller.js';
import { SolicitudesController } from '../solicitudes/solicitudes.controller.js';
import { ComprasSimplesController } from '../compras-simples/compras-simples.controller.js';
import { ProyectosController } from '../proyectos/proyectos.controller.js';
import { TrabajadoresController } from '../trabajadores/trabajadores.controller.js';
import { DashboardController } from '../dashboard/dashboard.controller.js';
import { ProveedoresController } from '../proveedores/proveedores.controller.js';
import { AlmacenesController } from '../almacenes/almacenes.controller.js';
import { ClientesController } from '../clientes/clientes.controller.js';
import { CotizacionesController } from '../cotizaciones/cotizaciones.controller.js';
import { OrdenesCompraController } from '../ordenes-compra/ordenes-compra.controller.js';
import { CobrosController } from '../cobros/cobros.controller.js';
import { UsersController } from '../users/users.controller.js';

// Recorre los decoradores reales de los controllers (@Roles) con el guard real,
// sin excepciones de módulo configuradas: es el acceso "por defecto" del código.
const guard = new RolesGuard(new Reflector(), {
  nivelExcepcion: () => Promise.resolve(null),
  hasAnyPermission: () => Promise.resolve(false),
} as never);

type Clase = new (...args: never[]) => object;

async function puede(
  role: Role,
  controller: Clase,
  handler: string,
  method = 'GET',
) {
  const proto = controller.prototype as Record<string, () => unknown>;
  // Un nombre mal escrito haría pasar en falso los casos negativos.
  if (typeof proto[handler] !== 'function')
    throw new Error(`${controller.name}.${handler} no existe`);
  const contexto = {
    getHandler: () => proto[handler],
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => ({ method, user: { id: 'u1', role } }),
    }),
  } as unknown as ExecutionContext;
  return guard.canActivate(contexto);
}

describe('Roles nuevos', () => {
  it('son configurables en la matriz de acceso por módulo', () => {
    expect(ROLES_CONFIGURABLES).toEqual(
      expect.arrayContaining(['tesoreria', 'coordinador_ssoma']),
    );
  });
});

describe('control de la matriz', () => {
  it('distingue roles: administración crea pagos fijos y Jefe SIG no', async () => {
    expect(
      await puede('administrador', PagosController, 'crearRecurrente', 'POST'),
    ).toBe(true);
    expect(
      await puede('jefe_sig', PagosController, 'crearRecurrente', 'POST'),
    ).toBe(false);
  });
});

describe('Tesorería — acceso por defecto', () => {
  const role: Role = 'tesoreria';

  it.each([
    [PagosController, 'findAll', 'GET'],
    [PagosController, 'findOne', 'GET'],
    [PagosController, 'resumen', 'GET'],
    [PagosController, 'reporte', 'GET'],
    [PagosController, 'reportePng', 'GET'],
    [PagosController, 'crearRecordatorio', 'POST'],
    [PagosController, 'update', 'PATCH'],
    [PagosController, 'marcarPagado', 'POST'],
    [PagosController, 'actualizarCodigoComprobante', 'PATCH'],
    [PagosController, 'cancelar', 'POST'],
    [PagosController, 'listarRecurrentes', 'GET'],
    [PagosController, 'listarPlanillaStaff', 'GET'],
    [AsistenciaGlobalController, 'planillasGlobal', 'GET'],
    [ConsolidadoAsistenciaController, 'listarPlanillas', 'GET'],
    [ConsolidadoAsistenciaController, 'obtenerPlanilla', 'GET'],
    [ConsolidadoAsistenciaController, 'planillaPreview', 'GET'],
    [ConsolidadoAsistenciaController, 'consolidadoObra', 'GET'],
    [ProyectosController, 'findAll', 'GET'],
    [DashboardController, 'inicio', 'GET'],
  ] as const)('puede %p.%s (%s)', async (controller, handler, method) => {
    expect(await puede(role, controller as Clase, handler, method)).toBe(true);
  });

  it.each([
    [PagosController, 'crearRecurrente', 'POST'],
    [PagosController, 'actualizarRecurrente', 'PATCH'],
    [PagosController, 'eliminarRecurrente', 'DELETE'],
    [PagosController, 'generarRecurrentes', 'POST'],
    [PagosController, 'generarPlanillaStaff', 'POST'],
    [ConsolidadoAsistenciaController, 'generarPlanilla', 'POST'],
    [AsistenciaGlobalController, 'obrasHoy', 'GET'],
    [AsistenciaGlobalController, 'listarJornadas', 'GET'],
    [AsistenciaGlobalController, 'controlAccesoGlobal', 'GET'],
    [CobrosController, 'findAll', 'GET'],
    [RequerimientosController, 'findAll', 'GET'],
    [SolicitudesController, 'findAll', 'GET'],
    [ComprasSimplesController, 'findAll', 'GET'],
    [CotizacionesController, 'findAll', 'GET'],
    [OrdenesCompraController, 'findAll', 'GET'],
    [ProveedoresController, 'findAll', 'GET'],
    [AlmacenesController, 'findAll', 'GET'],
    [ClientesController, 'findAll', 'GET'],
    [TrabajadoresController, 'findAll', 'GET'],
    [UsersController, 'findAll', 'GET'],
  ] as const)('NO puede %p.%s (%s)', async (controller, handler, method) => {
    expect(await puede(role, controller as Clase, handler, method)).toBe(false);
  });
});

describe('Coordinador SSOMA — acceso por defecto', () => {
  const role: Role = 'coordinador_ssoma';

  it.each([
    [DashboardController, 'inicio', 'GET'],
    [AsistenciaGlobalController, 'obrasHoy', 'GET'],
    [RequerimientosController, 'findAll', 'GET'],
    [RequerimientosController, 'findOne', 'GET'],
    [RequerimientosController, 'create', 'POST'],
    [RequerimientosController, 'enviar', 'POST'],
    [RequerimientosController, 'aprobar', 'POST'],
    [RequerimientosController, 'observar', 'POST'],
    [SolicitudesController, 'findAll', 'GET'],
    [ComprasSimplesController, 'findAll', 'GET'],
    [ComprasSimplesController, 'create', 'POST'],
    [ComprasSimplesController, 'aprobarGrupo', 'POST'],
    [ComprasSimplesController, 'observarGrupo', 'POST'],
    [ComprasSimplesController, 'cancelarGrupo', 'POST'],
    [ComprasSimplesController, 'editarItemsGrupo', 'PATCH'],
    [PagosController, 'findAll', 'GET'],
    [PagosController, 'crearRecordatorio', 'POST'],
    // la pantalla de asistencia lee la lista de trabajadores, igual que el PDR
    [TrabajadoresController, 'findAll', 'GET'],
  ] as const)('puede %p.%s (%s)', async (controller, handler, method) => {
    expect(await puede(role, controller as Clase, handler, method)).toBe(true);
  });

  it.each([
    [CotizacionesController, 'findAll', 'GET'],
    [OrdenesCompraController, 'findAll', 'GET'],
    [AlmacenesController, 'findAll', 'GET'],
    [ClientesController, 'findAll', 'GET'],
    [ProveedoresController, 'findAll', 'GET'],
    [TrabajadoresController, 'create', 'POST'],
    [CobrosController, 'findAll', 'GET'],
    [UsersController, 'findAll', 'GET'],
    [AsistenciaGlobalController, 'listarJornadas', 'GET'],
    [AsistenciaGlobalController, 'planillasGlobal', 'GET'],
    [AsistenciaGlobalController, 'controlAccesoGlobal', 'GET'],
    [AsistenciasController, 'registrarDesdeHoja', 'POST'],
    [PagosController, 'marcarPagado', 'POST'],
    [PagosController, 'listarRecurrentes', 'GET'],
    [PagosController, 'resumen', 'GET'],
    [ProyectosController, 'create', 'POST'],
    [ConsolidadoAsistenciaController, 'listarPlanillas', 'GET'],
  ] as const)('NO puede %p.%s (%s)', async (controller, handler, method) => {
    expect(await puede(role, controller as Clase, handler, method)).toBe(false);
  });
});
