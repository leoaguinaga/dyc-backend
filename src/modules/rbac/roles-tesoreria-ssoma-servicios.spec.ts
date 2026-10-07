import { jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import { DashboardService } from '../dashboard/dashboard.service.js';
import { PagosService } from '../pagos/pagos.service.js';
import { ProyectosService } from '../proyectos/proyectos.service.js';
import { JornadaGlobalService } from '../asistencias/jornada-global.service.js';
import { NotificacionesListener } from '../notificaciones/notificaciones.listener.js';
import { prismaMock, fn } from '../../testing/mocks.js';

const user = (role: string, id = 'u1') =>
  ({ id, name: 'Ana', email: 'a@x', role }) as never;
const obrasDe = (userId: string) => ({
  supervisores: { some: { userId } },
});

describe('Tesorería — servicios', () => {
  it('ve los pagos de todos (no se acota a los que registró ni a sus obras)', async () => {
    const prisma = prismaMock();
    const service = new PagosService(prisma as never, {} as never);
    await service.findAll({}, user('tesoreria'));
    const where = (prisma.pago.findMany.mock.calls[0][0] as { where: object })
      .where;
    expect(where).not.toHaveProperty('OR');

    await service.findAll({}, user('jefe_sig'));
    const whereJefe = (
      prisma.pago.findMany.mock.calls[1][0] as { where: object }
    ).where;
    expect(whereJefe).toHaveProperty('OR');
  });

  it('el inicio muestra pagos y planillas pendientes, no cobros ni requerimientos', async () => {
    const prisma = prismaMock();
    prisma.pago.findMany.mockResolvedValue([
      {
        id: 'p1',
        concepto: 'Alquiler',
        beneficiarioNombre: null,
        monto: 1500,
        fechaProgramada: new Date(),
        proyecto: null,
      },
    ]);
    prisma.planillaStaff.findMany.mockResolvedValue([]);
    const service = new DashboardService(prisma as never);

    const inicio = await service.inicio(user('tesoreria'));

    expect(inicio.usuario.etiquetaRol).toBe('Tesorería');
    expect(inicio.tareas.some((t) => t.tipo === 'pago')).toBe(true);
    expect(prisma.cobro.findMany).not.toHaveBeenCalled();
    expect(inicio.seguimiento).toEqual([]);
    const acciones = inicio.accionesRapidas.map((a) => a.id);
    expect(acciones).toEqual(['pagos', 'pago', 'planilla']);
  });

  it('gerencia y administración siguen viendo los cobros', async () => {
    const prisma = prismaMock();
    const service = new DashboardService(prisma as never);
    await service.inicio(user('gerencia'));
    expect(prisma.cobro.findMany).toHaveBeenCalled();
  });

  it('recibe las notificaciones de planilla generada', async () => {
    const service = { crearParaRoles: fn(), crearParaAsignadosDeObra: fn() };
    const listener = new NotificacionesListener(service as never);
    await listener.onPlanillaGenerada({
      planillaId: 'pl1',
      proyectoId: 'p1',
      proyectoNombre: 'Obra',
      periodoInicio: '2026-10-01',
      periodoFin: '2026-10-05',
      totalGeneral: '1000',
    });
    expect(service.crearParaRoles.mock.calls[0][0]).toContain('tesoreria');
  });
});

describe('Coordinador SSOMA — servicios', () => {
  const ssoma = user('coordinador_ssoma', 'u-ssoma');

  function proyectos(prisma: ReturnType<typeof prismaMock>) {
    return new ProyectosService(
      prisma as never,
      { emit: jest.fn() } as never,
      {} as never,
    );
  }

  it('lista solo las obras donde está asignado, también con ?todos=1', async () => {
    const prisma = prismaMock();
    const service = proyectos(prisma);
    await service.findAll('u-ssoma', 'coordinador_ssoma');
    await service.findAll('u-ssoma', 'coordinador_ssoma', true);
    for (const [args] of prisma.proyecto.findMany.mock.calls) {
      expect((args as { where: object }).where).toEqual(obrasDe('u-ssoma'));
    }
  });

  it('otros roles con ?todos=1 siguen viendo todo', async () => {
    const prisma = prismaMock();
    await proyectos(prisma).findAll('u1', 'gerencia', true);
    expect(
      (prisma.proyecto.findMany.mock.calls[0][0] as { where?: object }).where,
    ).toBeUndefined();
  });

  it('no abre la ficha de una obra ajena, sí la asignada', async () => {
    const prisma = prismaMock();
    const service = proyectos(prisma);
    prisma.proyecto.findUnique.mockResolvedValue({
      id: 'p1',
      supervisores: [{ userId: 'otro' }],
    });
    await expect(
      service.findOne('p1', 'u-ssoma', 'coordinador_ssoma'),
    ).rejects.toThrow(ForbiddenException);

    prisma.proyecto.findUnique.mockResolvedValue({
      id: 'p1',
      supervisores: [{ userId: 'u-ssoma' }],
    });
    await expect(
      service.findOne('p1', 'u-ssoma', 'coordinador_ssoma'),
    ).resolves.toEqual(expect.objectContaining({ id: 'p1' }));
  });

  it('"asistencia de hoy" trae solo sus obras y puede operarlas', async () => {
    const prisma = prismaMock();
    prisma.proyecto.findMany.mockResolvedValue([
      {
        id: 'p1',
        nombre: 'Obra',
        codigo: 'O-1',
        turnoConfigs: [],
        turnos: [],
      },
    ]);
    const service = new JornadaGlobalService(prisma as never);
    const hoy = await service.obrasHoy('u-ssoma', 'coordinador_ssoma');
    const where = (
      prisma.proyecto.findMany.mock.calls[0][0] as { where: object }
    ).where;
    expect(where).toEqual(expect.objectContaining(obrasDe('u-ssoma')));
    expect(hoy.obras[0].puedeOperar).toBe(true);
  });

  it('el inicio acota lo por aprobar a sus obras y solo a seguridad', async () => {
    const prisma = prismaMock();
    const service = new DashboardService(prisma as never);
    const inicio = await service.inicio(ssoma);

    const consultas = prisma.requerimiento.findMany.mock.calls.map(
      ([a]) => (a as { where: Record<string, unknown> }).where,
    );
    const porAprobar = consultas.find((w) => w.estado === 'enviado');
    expect(porAprobar).toEqual({
      estado: 'enviado',
      tipo: { in: ['seguridad'] },
      proyecto: obrasDe('u-ssoma'),
    });
    const compras = prisma.ordenCompra.findMany.mock.calls.map(
      ([a]) => (a as { where: { compraSimple?: unknown } }).where.compraSimple,
    );
    expect(compras).toContainEqual({
      tipo: { in: ['seguridad'] },
      proyecto: obrasDe('u-ssoma'),
    });
    expect(inicio.usuario.etiquetaRol).toBe('Coordinación SSOMA');
    expect(inicio.accionesRapidas.map((a) => a.id)).toContain('asistencia');
  });

  it('no ve el seguimiento de cotizaciones (no tiene ese módulo)', async () => {
    const prisma = prismaMock();
    prisma.solicitudCotizacion.findMany.mockResolvedValue([
      {
        id: 's1',
        codigo: 'SC-1',
        estado: 'enviada',
        actualizadoEn: new Date(),
        requerimiento: { id: 'r1', codigo: 'RQ-1', nombre: 'EPP' },
      },
    ]);
    const inicio = await new DashboardService(prisma as never).inicio(ssoma);
    expect(inicio.seguimiento).toEqual([]);

    // otros roles sí lo ven
    const otro = await new DashboardService(prisma as never).inicio(
      user('jefe_sig'),
    );
    expect(otro.seguimiento).toHaveLength(1);
  });

  it('avisa de requerimientos y compras de seguridad solo a los asignados a la obra', async () => {
    const service = { crearParaRoles: fn(), crearParaAsignadosDeObra: fn() };
    const listener = new NotificacionesListener(service as never);

    await listener.onRequerimientoCreado({
      requerimientoId: 'r1',
      codigo: 'REQ-1',
      nombre: 'EPP',
      proyectoId: 'p1',
      tipo: 'seguridad',
    });
    await listener.onCompraSimpleCreada({
      compraSimpleId: 'c1',
      compraSimpleCodigo: 'CS-1',
      compraSimpleNombre: 'Guantes',
      tipo: 'seguridad',
      proyectoId: 'p1',
    });
    expect(service.crearParaAsignadosDeObra).toHaveBeenCalledTimes(2);
    expect(service.crearParaAsignadosDeObra.mock.calls[0].slice(0, 2)).toEqual([
      'coordinador_ssoma',
      'p1',
    ]);
    // el aviso general a roles no incluye al coordinador (no es por rol)
    for (const [roles] of service.crearParaRoles.mock.calls) {
      expect(roles).not.toContain('coordinador_ssoma');
    }
  });

  it('no lo avisa de lo que no es de seguridad', async () => {
    const service = { crearParaRoles: fn(), crearParaAsignadosDeObra: fn() };
    const listener = new NotificacionesListener(service as never);
    await listener.onRequerimientoCreado({
      requerimientoId: 'r1',
      codigo: 'REQ-1',
      nombre: 'Cemento',
      proyectoId: 'p1',
      tipo: 'civil',
    });
    expect(service.crearParaAsignadosDeObra).not.toHaveBeenCalled();
  });
});
