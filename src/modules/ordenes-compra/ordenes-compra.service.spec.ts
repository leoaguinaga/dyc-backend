import { OrdenesCompraService } from './ordenes-compra.service.js';

function solicitudConIgv(incluyeIgv: boolean) {
  return {
    id: 'sol-1',
    estado: 'aprobada_gerencia',
    proyectoId: 'proy-1',
    requerimiento: {
      proyectoId: 'proy-1',
      nombre: 'Sistema de agua contra incendios',
    },
    cotizaciones: [
      {
        proveedorId: 'prov-1',
        proveedor: {
          id: 'prov-1',
          razonSocial: 'AIR PROJECT PERU E.I.R.L.',
          ruc: '20123456789',
          condicionPago: null,
        },
        condicionPago: null,
        incluyeIgv,
        estado: 'aprobada',
        items: [
          {
            seleccionado: true,
            descripcionProveedor: 'Sistema de agua contra incendios',
            cantidad: 1,
            unidad: 'global',
            precioUnit: 46610.17,
          },
        ],
        // Igual que OC-2026-0062: 4 cuotas 30/20/30/20.
        condicionesPago: [
          { porcentaje: 30, fecha: new Date('2026-09-24') },
          { porcentaje: 20, fecha: new Date('2026-09-29') },
          { porcentaje: 30, fecha: new Date('2026-10-16') },
          { porcentaje: 20, fecha: new Date('2026-10-31') },
        ],
      },
    ],
  };
}

function setup(solicitud: ReturnType<typeof solicitudConIgv>) {
  const ocCreadas: { data: Record<string, unknown> }[] = [];
  const tx = {
    $executeRaw: () => Promise.resolve(0),
    $queryRaw: () => Promise.resolve([{ max: 0 }]),
    solicitudCotizacion: { update: () => Promise.resolve({}) },
    ordenCompra: {
      create: (args: { data: Record<string, unknown> }) => {
        ocCreadas.push(args);
        return Promise.resolve({
          id: 'oc-nueva',
          numero: 'OC-2026-0062',
          proveedor: { razonSocial: 'AIR PROJECT PERU E.I.R.L.' },
        });
      },
    },
  };
  const prisma = {
    solicitudCotizacion: { findUnique: () => Promise.resolve(solicitud) },
    proyecto: {
      findUnique: () => Promise.resolve({ direccion: 'Av. de la Marina 2000' }),
    },
    $transaction: (cb: (tx: unknown) => unknown) => Promise.resolve(cb(tx)),
  };
  const events = { emit: () => {} };
  const service = new OrdenesCompraService(prisma as never, events as never);
  return { service, ocCreadas };
}

describe('OrdenesCompraService.create — plan de pagos con IGV', () => {
  it('reparte las cuotas sobre el total con IGV cuando la cotización no lo incluye', async () => {
    const { service, ocCreadas } = setup(solicitudConIgv(false));

    await service.create({ solicitudId: 'sol-1' }, 'user-1');

    const data = ocCreadas[0].data;
    // montoTotal (subtotal de ítems) no se toca.
    expect(data.montoTotal).toBe(46610.17);

    const pagos = (
      data.pagos as { create: { monto: number; porcentaje: number }[] }
    ).create;
    expect(pagos.map((p) => p.monto)).toEqual([16500, 11000, 16500, 11000]);
    expect(pagos.reduce((s, p) => s + p.monto, 0)).toBeCloseTo(55000, 2);
  });

  it('reparte las cuotas sobre montoTotal tal cual cuando la cotización ya incluye IGV', async () => {
    const { service, ocCreadas } = setup(solicitudConIgv(true));

    await service.create({ solicitudId: 'sol-1' }, 'user-1');

    const data = ocCreadas[0].data;
    const pagos = (data.pagos as { create: { monto: number }[] }).create;
    // Sin ajuste: 30%/20% directo de 46610.17.
    expect(pagos.map((p) => p.monto)).toEqual([
      13983.051, 9322.034, 13983.051, 9322.034,
    ]);
    expect(pagos.reduce((s, p) => s + p.monto, 0)).toBeCloseTo(46610.17, 2);
  });

  it('genera la orden ya emitida, sin paso de emisión', async () => {
    const { service, ocCreadas } = setup(solicitudConIgv(true));

    await service.create({ solicitudId: 'sol-1' }, 'user-1');

    expect(ocCreadas[0].data.estado).toBe('emitida');
    expect(ocCreadas[0].data.fechaEmision).toBeInstanceOf(Date);
  });

  it('rechaza generar la orden si el proveedor no tiene RUC', async () => {
    const solicitud = solicitudConIgv(true);
    solicitud.cotizaciones[0].proveedor.ruc = null as never;
    const { service, ocCreadas } = setup(solicitud);

    await expect(
      service.create({ solicitudId: 'sol-1' }, 'user-1'),
    ).rejects.toThrow('no tiene RUC');
    expect(ocCreadas).toHaveLength(0);
  });
});
