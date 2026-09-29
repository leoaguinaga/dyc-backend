import { PagosService } from './pagos.service.js';

const OC_SIN_IGV = {
  id: 'oc-1',
  montoTotal: 46610.17,
  incluyeIgv: false,
  proyectoId: 'proy-1',
  concepto: 'Sistema de agua contra incendios',
};

const OC_CON_IGV = {
  id: 'oc-2',
  montoTotal: 55000,
  incluyeIgv: true,
  proyectoId: 'proy-1',
  concepto: 'Otra compra',
};

function setup() {
  const created: unknown[] = [];
  const updated: unknown[] = [];
  const deletedIds: string[] = [];
  const ordenesPorId: Record<string, typeof OC_SIN_IGV | typeof OC_CON_IGV> = {
    [OC_SIN_IGV.id]: OC_SIN_IGV,
    [OC_CON_IGV.id]: OC_CON_IGV,
  };

  const prisma = {
    ordenCompra: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(ordenesPorId[where.id] ?? null),
    },
    pago: {
      findMany: () => Promise.resolve([]),
      create: (args: { data: unknown }) => {
        created.push(args.data);
        return Promise.resolve({ id: 'nuevo-pago', ...(args.data as object) });
      },
      update: (args: { where: { id: string }; data: unknown }) => {
        updated.push(args);
        return Promise.resolve({ id: args.where.id, ...(args.data as object) });
      },
      delete: (args: { where: { id: string } }) => {
        deletedIds.push(args.where.id);
        return Promise.resolve({});
      },
    },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  };

  const storage = {};
  const service = new PagosService(prisma as never, storage as never);
  return { service, created, updated, deletedIds };
}

describe('PagosService — monto del plan de pagos con IGV', () => {
  it('create: suma el 18% antes de repartir el porcentaje si la OC no incluye IGV', async () => {
    const { service, created } = setup();

    await service.create(
      {
        ordenCompraId: OC_SIN_IGV.id,
        porcentaje: 30,
        fechaProgramada: '2026-09-24',
      },
      'user-1',
    );

    // 46610.17 * 1.18 = 55000.00 exacto; 30% de eso = 16500.00
    expect((created[0] as { monto: number }).monto).toBe(16500);
  });

  it('create: no agrega IGV si la OC ya lo incluye en los precios', async () => {
    const { service, created } = setup();

    await service.create(
      {
        ordenCompraId: OC_CON_IGV.id,
        porcentaje: 30,
        fechaProgramada: '2026-09-24',
      },
      'user-1',
    );

    expect((created[0] as { monto: number }).monto).toBe(16500); // 30% de 55000
  });

  it('syncPlan: reparte el plan completo sobre el monto final con IGV', async () => {
    const { service, created } = setup();

    await service.syncPlan(
      OC_SIN_IGV.id,
      {
        tramos: [
          { porcentaje: 30, fecha: '2026-09-24' },
          { porcentaje: 20, fecha: '2026-09-29' },
          { porcentaje: 30, fecha: '2026-10-16' },
          { porcentaje: 20, fecha: '2026-10-31' },
        ],
      },
      'user-1',
    );

    const montos = created.map((d) => (d as { monto: number }).monto);
    expect(montos).toEqual([16500, 11000, 16500, 11000]);
    expect(montos.reduce((s, m) => s + m, 0)).toBeCloseTo(55000, 2);
  });

  it('update por porcentaje: recalcula el monto sobre el total con IGV de la OC', async () => {
    // findOne() usa PAGO_INCLUDE con prisma.pago.findUnique — lo mockeamos directo.
    const updates: { where: { id: string }; data: Record<string, unknown> }[] =
      [];
    const prisma = {
      pago: {
        findUnique: () =>
          Promise.resolve({
            id: 'pago-1',
            estado: 'pendiente',
            registradoPorId: 'user-1',
            ordenCompraId: OC_SIN_IGV.id,
            ordenCompra: {
              montoTotal: OC_SIN_IGV.montoTotal,
              incluyeIgv: OC_SIN_IGV.incluyeIgv,
            },
            fechaProgramada: new Date('2026-09-24'),
          }),
        findMany: () => Promise.resolve([]),
        update: (args: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          updates.push(args);
          return Promise.resolve({ id: args.where.id, ...args.data });
        },
      },
    };
    const svc = new PagosService(prisma as never, {} as never);

    await svc.update('pago-1', { porcentaje: 30 }, {
      id: 'user-1',
      role: 'administrador',
    } as never);

    expect(updates[0].data.monto).toBe(16500);
  });
});

describe('PagosService — correlativo del comprobante', () => {
  const anio = String(new Date().getFullYear()).slice(-2);

  function setupCodigo(codigosUsados: string[], otroConCodigo = false) {
    const updates: Array<{ data: Record<string, unknown> }> = [];
    const pago = {
      id: 'pago-1',
      estado: 'pendiente',
      codigoComprobante: null,
      fechaProgramada: new Date('2026-09-24'),
      metodoPago: 'efectivo',
    };
    const prisma = {
      pago: {
        findUnique: () => Promise.resolve(pago),
        findMany: () =>
          Promise.resolve(codigosUsados.map((codigoComprobante) => ({ codigoComprobante }))),
        findFirst: () => Promise.resolve(otroConCodigo ? { id: 'otro' } : null),
        update: (args: { data: Record<string, unknown> }) => {
          updates.push(args);
          return Promise.resolve({ ...pago, ...args.data });
        },
      },
    };
    return { svc: new PagosService(prisma as never, {} as never), updates, pago };
  }

  it('marcarPagado asigna AA-0001 cuando aún no hay códigos en el año', async () => {
    const { svc, updates } = setupCodigo([]);
    await svc.marcarPagado('pago-1', {}, 'user-1');
    expect(updates[0].data.codigoComprobante).toBe(`${anio}-0001`);
  });

  it('marcarPagado continúa desde el mayor número usado (respeta ediciones manuales)', async () => {
    const { svc, updates } = setupCodigo([`${anio}-0001`, `${anio}-2078`, `${anio}-0300`]);
    await svc.marcarPagado('pago-1', {}, 'user-1');
    expect(updates[0].data.codigoComprobante).toBe(`${anio}-2079`);
  });

  it('actualizarCodigoComprobante rechaza un código ya usado por otro comprobante', async () => {
    const { svc, pago } = setupCodigo([], true);
    pago.estado = 'pagado';
    await expect(
      svc.actualizarCodigoComprobante('pago-1', { codigo: `${anio}-2078` }),
    ).rejects.toThrow(/ya está asignado/);
  });

  it('actualizarCodigoComprobante guarda el código editado', async () => {
    const { svc, pago, updates } = setupCodigo([]);
    pago.estado = 'pagado';
    await svc.actualizarCodigoComprobante('pago-1', { codigo: `${anio}-2078` });
    expect(updates[0].data.codigoComprobante).toBe(`${anio}-2078`);
  });
});
