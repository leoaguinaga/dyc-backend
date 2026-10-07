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
    const busquedas: Array<{ where: Record<string, unknown> }> = [];
    const pago = {
      id: 'pago-1',
      estado: 'pendiente',
      codigoComprobante: null,
      subNumero: 1,
      empresaId: null as string | null,
      fechaProgramada: new Date('2026-09-24'),
      metodoPago: 'efectivo',
    };
    const prisma = {
      pago: {
        findUnique: () => Promise.resolve(pago),
        findMany: () =>
          Promise.resolve(codigosUsados.map((codigoComprobante) => ({ codigoComprobante }))),
        findFirst: (args: { where: Record<string, unknown> }) => {
          busquedas.push(args);
          return Promise.resolve(otroConCodigo ? { id: 'otro' } : null);
        },
        update: (args: { data: Record<string, unknown> }) => {
          updates.push(args);
          return Promise.resolve({ ...pago, ...args.data });
        },
      },
      empresa: { findUnique: () => Promise.resolve({ id: 'empresa-dyc' }) },
      cuentaEmpresa: {
        findUnique: ({ where }: { where: { id: string } }) =>
          Promise.resolve(
            where.id === 'cuenta-bcp'
              ? { id: 'cuenta-bcp', empresaId: 'empresa-otra', activa: true }
              : where.id === 'cuenta-baja'
                ? { id: 'cuenta-baja', empresaId: 'empresa-dyc', activa: false }
                : null,
          ),
      },
      trabajador: {
        findUnique: ({ where }: { where: { id: string } }) =>
          Promise.resolve(where.id === 't-1' ? { id: 't-1', nombre: 'Carlos Palma' } : null),
      },
    };
    return { svc: new PagosService(prisma as never, {} as never), updates, busquedas, pago };
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

  it('el chequeo de duplicados mira la línea: 26-2248.2 no choca con 26-2248.1', async () => {
    const { svc, pago, busquedas } = setupCodigo([]);
    pago.estado = 'pagado';
    pago.subNumero = 2;
    await svc.actualizarCodigoComprobante('pago-1', { codigo: `${anio}-2248` });
    expect(busquedas[0].where).toMatchObject({ codigoComprobante: `${anio}-2248`, subNumero: 2 });
  });

  it('marcarPagado toma la empresa de la cuenta de origen elegida', async () => {
    const { svc, updates } = setupCodigo([]);
    await svc.marcarPagado('pago-1', { cuentaOrigenId: 'cuenta-bcp' }, 'user-1');
    expect(updates[0].data).toMatchObject({ cuentaOrigenId: 'cuenta-bcp', empresaId: 'empresa-otra' });
  });

  it('marcarPagado sin cuenta asigna la empresa por defecto si el pago no tenía empresa', async () => {
    const { svc, updates } = setupCodigo([]);
    await svc.marcarPagado('pago-1', {}, 'user-1');
    expect(updates[0].data.empresaId).toBe('empresa-dyc');
    expect(updates[0].data).not.toHaveProperty('cuentaOrigenId');
  });

  it('marcarPagado sin cuenta conserva la empresa que el pago ya tenía', async () => {
    const { svc, updates, pago } = setupCodigo([]);
    pago.empresaId = 'empresa-previa';
    await svc.marcarPagado('pago-1', {}, 'user-1');
    expect(updates[0].data).not.toHaveProperty('empresaId');
  });

  it('marcarPagado rechaza cuentas inexistentes o desactivadas', async () => {
    const { svc } = setupCodigo([]);
    await expect(svc.marcarPagado('pago-1', { cuentaOrigenId: 'x' }, 'u')).rejects.toThrow(/no encontrada/);
    await expect(svc.marcarPagado('pago-1', { cuentaOrigenId: 'cuenta-baja' }, 'u')).rejects.toThrow(/desactivada/);
  });

  it('el responsable de la rendición vinculado a un trabajador toma su nombre', async () => {
    const { svc, updates } = setupCodigo([]);
    await svc.marcarPagado('pago-1', { responsableRendicionId: 't-1' }, 'u');
    expect(updates[0].data).toMatchObject({ responsableRendicionId: 't-1', responsableRendicionNombre: 'Carlos Palma' });
  });

  it('el responsable de la rendición puede ser solo un nombre (sin vínculo)', async () => {
    const { svc, updates } = setupCodigo([]);
    await svc.marcarPagado('pago-1', { responsableRendicionNombre: ' ADMINISTRACION ' }, 'u');
    expect(updates[0].data).toMatchObject({ responsableRendicionId: null, responsableRendicionNombre: 'ADMINISTRACION' });
  });

  it('actualizarRendicion solo aplica a pagos ya realizados y guarda importe y estado', async () => {
    const { svc, pago, updates } = setupCodigo([]);
    await expect(svc.actualizarRendicion('pago-1', { estadoRendicion: 'cerrado' })).rejects.toThrow(/ya realizados/);
    pago.estado = 'pagado';
    await svc.actualizarRendicion('pago-1', { importeRendido: 180, estadoRendicion: 'cerrado' });
    expect(updates[0].data).toMatchObject({ importeRendido: 180, estadoRendicion: 'cerrado' });
  });
});
