import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CotizacionesService } from './cotizaciones.service.js';
import { AppEvents } from '../../shared/events/events.js';
import { fn, prismaMock, type PrismaMock } from '../../testing/mocks.js';

const LOGISTICA = { id: 'log', role: 'logistica' as const };
const GERENCIA = { id: 'ger', role: 'gerencia' as const };
const SUPERVISOR = { id: 'sup', role: 'supervisor' as const };

function setup() {
  const prisma: PrismaMock = prismaMock();
  const events = { emit: fn() };
  const storage = {
    save: fn(() => Promise.resolve({ url: '/u/x.pdf' })),
    remove: fn(() => Promise.resolve()),
  };
  const service = new CotizacionesService(
    prisma as never,
    events as never,
    storage,
  );
  return { prisma, events, storage, service };
}

const solicitud = (extra: object = {}) => ({
  id: 's1',
  codigo: 'SC-2026-001',
  estado: 'cotizada',
  requerimientoId: 'r1',
  ordenes: [],
  cotizaciones: [
    {
      id: 'c1',
      proveedorId: 'pA',
      items: [
        { id: 'i1', seleccionado: false },
        { id: 'i2', seleccionado: false },
      ],
    },
    { id: 'c2', proveedorId: 'pB', items: [{ id: 'i3', seleccionado: false }] },
  ],
  ...extra,
});

describe('CotizacionesService — listados', () => {
  it('acota por tipo del requerimiento con alcance=rol', async () => {
    const { service, prisma } = setup();
    await service.findAllSolicitudes({ alcance: 'rol' } as never, 'jefe_sig');
    const where = prisma.solicitudCotizacion.findMany.mock.calls[0][0].where;
    expect(where.requerimiento).toEqual({
      tipo: { in: ['seguridad', 'administrativo'] },
    });
  });

  it('gerencia con alcance=rol solo ve lo que espera su aprobación', async () => {
    const { service, prisma } = setup();
    await service.findAllSolicitudes(
      { alcance: 'rol', estado: 'cotizada' } as never,
      'gerencia',
    );
    expect(
      prisma.solicitudCotizacion.findMany.mock.calls[0][0].where.estado,
    ).toBe('aprobada_solicitante');
  });

  it('el historial pagina con valores por defecto', async () => {
    const { service, prisma } = setup();
    await service.findHistorialSolicitudes({}, 'logistica');
    expect(prisma.solicitudCotizacion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 30, skip: 0 }),
    );
  });

  it('findOneSolicitud falla si no existe', async () => {
    const { service } = setup();
    await expect(service.findOneSolicitud('x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('CotizacionesService.createSolicitud', () => {
  const items = [
    { descripcion: 'Cemento', cantidadTotal: 10, cantidadAlmacen: 4 },
  ];

  it('toma la obra del requerimiento, invita proveedores y pasa el requerimiento a en_cotizacion', async () => {
    const { service, prisma, events } = setup();
    prisma.requerimiento.findUnique
      .mockResolvedValueOnce({ proyectoId: 'p1' })
      .mockResolvedValueOnce({
        id: 'r1',
        codigo: 'RQ-1',
        nombre: 'Cemento',
        creadoPorId: 'sup',
        estado: 'aprobado',
      });
    prisma.solicitudCotizacion.count.mockResolvedValue(4);
    await service.createSolicitud({
      requerimientoId: 'r1',
      items,
      proveedorIds: ['pA'],
    });
    const data = prisma.solicitudCotizacion.create.mock.calls[0][0].data;
    expect(data).toEqual(
      expect.objectContaining({
        proyectoId: 'p1',
        estado: 'enviada',
        codigo: `SC-${new Date().getFullYear()}-005`,
      }),
    );
    expect(data.items.create[0]).toEqual(
      expect.objectContaining({ cantidadCompra: 6, unidad: 'und' }),
    );
    expect(data.cotizaciones.create).toEqual([{ proveedorId: 'pA' }]);
    expect(prisma.requerimiento.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { estado: 'en_cotizacion' },
    });
    expect(events.emit).toHaveBeenCalledWith(
      AppEvents.REQUERIMIENTO_ESTADO_CAMBIADO,
      expect.objectContaining({ estado: 'en_cotizacion' }),
    );
  });

  it('sin proveedores queda en borrador; exige obra o requerimiento válido', async () => {
    const { service, prisma } = setup();
    await service.createSolicitud({ proyectoId: 'p1', items });
    expect(prisma.solicitudCotizacion.create.mock.calls[0][0].data.estado).toBe(
      'borrador',
    );
    await expect(service.createSolicitud({ items })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.createSolicitud({ requerimientoId: 'x', items }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CotizacionesService.updateSolicitud', () => {
  it('bloquea solicitudes con orden o canceladas, y la aprobada solo la edita gerencia', async () => {
    const { service, prisma } = setup();
    prisma.solicitudCotizacion.findUnique.mockResolvedValueOnce(
      solicitud({ estado: 'orden_generada' }),
    );
    await expect(
      service.updateSolicitud('s1', {}, LOGISTICA),
    ).rejects.toBeInstanceOf(BadRequestException);
    prisma.solicitudCotizacion.findUnique.mockResolvedValueOnce(
      solicitud({ estado: 'aprobada_gerencia' }),
    );
    await expect(
      service.updateSolicitud('s1', {}, LOGISTICA),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('actualiza ítems existentes, crea nuevos y desvincula los eliminados', async () => {
    const { service, prisma } = setup();
    prisma.solicitudCotizacion.findUnique.mockResolvedValue(
      solicitud({ estado: 'aprobada_gerencia' }),
    );
    prisma.solicitudItem.findMany.mockResolvedValue([
      { id: 'si1' },
      { id: 'si2' },
    ]);
    await service.updateSolicitud(
      's1',
      {
        nota: 'n',
        items: [
          { id: 'si1', descripcion: 'A', cantidadTotal: 5 },
          {
            descripcion: 'Nuevo',
            cantidadTotal: 2,
            cantidadAlmacen: 1,
            itemInventarioId: 'inv',
          },
        ],
      },
      GERENCIA,
    );
    expect(prisma.cotizacionItem.updateMany).toHaveBeenCalledWith({
      where: { solicitudItemId: { in: ['si2'] } },
      data: { solicitudItemId: null },
    });
    expect(prisma.solicitudItem.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['si2'] } },
    });
    expect(prisma.solicitudItem.update).toHaveBeenCalledWith({
      where: { id: 'si1' },
      data: expect.objectContaining({ cantidadCompra: 5 }),
    });
    expect(prisma.solicitudItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        descripcion: 'Nuevo',
        cantidadCompra: 1,
        solicitudId: 's1',
      }),
    });
  });
});

describe('CotizacionesService — invitar y recibir', () => {
  it('no invita dos veces al mismo proveedor y saca de borrador', async () => {
    const { service, prisma } = setup();
    prisma.solicitudCotizacion.findUnique.mockResolvedValue(
      solicitud({ estado: 'borrador' }),
    );
    await expect(
      service.inviteProveedor('s1', { proveedorId: 'pA' }, LOGISTICA),
    ).rejects.toThrow(/ya fue invitado/);
    await service.inviteProveedor('s1', { proveedorId: 'pC' }, LOGISTICA);
    expect(prisma.cotizacion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          proveedorId: 'pC',
          creadoPorId: 'log',
        }),
      }),
    );
    expect(prisma.solicitudCotizacion.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { estado: 'enviada' },
    });
  });

  const respuesta = (extra: object = {}) => ({
    condicionesPago: [
      { porcentaje: 50, fecha: '2026-10-01' },
      { porcentaje: 50, fecha: '2026-11-01' },
    ],
    items: [
      { descripcionProveedor: 'Cemento', precioUnit: 25.1234, cantidad: 10 },
    ],
    ...extra,
  });

  it('registra la respuesta, marca la solicitud cotizada y avisa', async () => {
    const { service, prisma, events } = setup();
    prisma.cotizacion.findUnique.mockResolvedValue({
      id: 'c1',
      estado: 'pendiente',
      solicitudId: 's1',
      fechaRecibida: null,
      solicitud: { estado: 'enviada', codigo: 'SC-1' },
    });
    prisma.cotizacion.update.mockResolvedValue({
      proveedor: { razonSocial: 'Ferretería' },
    });
    await service.receiveCotizacion('c1', respuesta() as never, LOGISTICA);
    const data = prisma.cotizacion.update.mock.calls[0][0].data;
    expect(data.estado).toBe('recibida');
    expect(data.items.create[0].seleccionado).toBe(false);
    expect(prisma.solicitudCotizacion.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { estado: 'cotizada' },
    });
    expect(events.emit).toHaveBeenCalledWith(
      AppEvents.COTIZACION_RECIBIDA,
      expect.objectContaining({ proveedorNombre: 'Ferretería' }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      AppEvents.COTIZACION_ESTADO_CAMBIADO,
      expect.objectContaining({ estado: 'cotizada' }),
    );
  });

  it('corregir una aprobada conserva el estado y la selección', async () => {
    const { service, prisma, events } = setup();
    prisma.cotizacion.findUnique.mockResolvedValue({
      id: 'c1',
      estado: 'aprobada',
      solicitudId: 's1',
      fechaRecibida: new Date(),
      solicitud: { estado: 'seleccionada', codigo: 'SC-1' },
    });
    prisma.cotizacion.update.mockResolvedValue({
      proveedor: { razonSocial: 'X' },
    });
    await service.receiveCotizacion(
      'c1',
      respuesta({ fechaEntrega: '2026-10-10', incluyeIgv: true }) as never,
      LOGISTICA,
    );
    const data = prisma.cotizacion.update.mock.calls[0][0].data;
    expect(data).toEqual(
      expect.objectContaining({ estado: 'aprobada', incluyeIgv: true }),
    );
    expect(data.items.create[0].seleccionado).toBe(true);
    expect(prisma.solicitudCotizacion.update).not.toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledTimes(2);
  });

  it('valida estado, permisos, porcentajes y decimales', async () => {
    const { service, prisma } = setup();
    await expect(
      service.receiveCotizacion('x', respuesta() as never, LOGISTICA),
    ).rejects.toBeInstanceOf(NotFoundException);
    prisma.cotizacion.findUnique.mockResolvedValueOnce({
      estado: 'rechazada',
      solicitud: { estado: 'cotizada' },
    });
    await expect(
      service.receiveCotizacion('c1', respuesta() as never, LOGISTICA),
    ).rejects.toThrow(/pendientes, recibidas o aprobadas/);
    prisma.cotizacion.findUnique.mockResolvedValueOnce({
      estado: 'recibida',
      solicitud: { estado: 'orden_generada' },
    });
    await expect(
      service.receiveCotizacion('c1', respuesta() as never, LOGISTICA),
    ).rejects.toThrow(/ya se generó una orden/);
    prisma.cotizacion.findUnique.mockResolvedValueOnce({
      estado: 'recibida',
      solicitud: { estado: 'aprobada_gerencia' },
    });
    await expect(
      service.receiveCotizacion('c1', respuesta() as never, LOGISTICA),
    ).rejects.toBeInstanceOf(ForbiddenException);
    prisma.cotizacion.findUnique.mockResolvedValueOnce({
      estado: 'pendiente',
      solicitud: { estado: 'enviada' },
    });
    await expect(
      service.receiveCotizacion(
        'c1',
        respuesta({
          condicionesPago: [{ porcentaje: 60, fecha: '2026-10-01' }],
        }) as never,
        LOGISTICA,
      ),
    ).rejects.toThrow(
      'Las condiciones de pago deben sumar 100% (actual: 60.00%)',
    );
    prisma.cotizacion.findUnique.mockResolvedValueOnce({
      estado: 'pendiente',
      solicitud: { estado: 'enviada' },
    });
    await expect(
      service.receiveCotizacion(
        'c1',
        respuesta({
          items: [
            {
              descripcionProveedor: 'Fierro',
              precioUnit: 1.12345,
              cantidad: 1,
            },
          ],
        }) as never,
        LOGISTICA,
      ),
    ).rejects.toThrow(/más de 4 decimales/);
  });
});

describe('CotizacionesService — aprobar y estados', () => {
  it('aprobarCotizacion valida la cotización y delega en adjudicarSolicitud', async () => {
    const { service, prisma } = setup();
    await expect(service.aprobarCotizacion('x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    prisma.cotizacion.findUnique.mockResolvedValueOnce({ estado: 'pendiente' });
    await expect(service.aprobarCotizacion('c1')).rejects.toThrow(/recibidas/);

    prisma.solicitudCotizacion.findUnique.mockResolvedValue(solicitud());
    prisma.cotizacion.findUnique.mockResolvedValueOnce({
      id: 'c1',
      estado: 'recibida',
      solicitudId: 's1',
      items: [
        { id: 'i1', solicitudItemId: 'si1' },
        { id: 'i2', solicitudItemId: 'si2' },
      ],
    });
    await service.aprobarCotizacion('c1');

    // Mismo resultado que adjudicar todos los ítems de c1: gana c1, c2 se rechaza.
    const estados = prisma.cotizacion.update.mock.calls.map((c: any) => [
      c[0].where.id,
      c[0].data.estado,
    ]);
    expect(estados).toEqual([
      ['c1', 'aprobada'],
      ['c2', 'rechazada'],
    ]);
    expect(prisma.cotizacionItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['i1', 'i2'] } },
      data: { seleccionado: true },
    });
    expect(prisma.solicitudCotizacion.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { estado: 'seleccionada' },
    });
  });

  it('marcarSinRespuesta solo para pendientes', async () => {
    const { service, prisma } = setup();
    await expect(service.marcarSinRespuesta('x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    prisma.cotizacion.findUnique.mockResolvedValueOnce({ estado: 'recibida' });
    await expect(service.marcarSinRespuesta('c1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    prisma.cotizacion.findUnique.mockResolvedValueOnce({ estado: 'pendiente' });
    await service.marcarSinRespuesta('c1');
    expect(prisma.cotizacion.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { estado: 'sin_respuesta' } }),
    );
  });

  it('avanzarEstadoSolicitud respeta transiciones y adjudicación', async () => {
    const { service, prisma } = setup();
    prisma.solicitudCotizacion.findUnique.mockResolvedValueOnce(
      solicitud({ estado: 'cotizada' }),
    );
    await expect(
      service.avanzarEstadoSolicitud('s1', 'aprobada_gerencia', GERENCIA),
    ).rejects.toThrow('No se puede pasar de "cotizada" a "aprobada_gerencia"');
    prisma.solicitudCotizacion.findUnique.mockResolvedValueOnce(
      solicitud({ estado: 'aprobada_solicitante' }),
    );
    await expect(
      service.avanzarEstadoSolicitud('s1', 'aprobada_gerencia', GERENCIA),
    ).rejects.toThrow(/al menos un ítem adjudicado/);
    prisma.solicitudCotizacion.findUnique.mockResolvedValueOnce(
      solicitud({ estado: 'enviada', ordenes: [{ id: 'oc' }] }),
    );
    await expect(
      service.avanzarEstadoSolicitud('s1', 'cancelada', LOGISTICA),
    ).rejects.toThrow(/órdenes relacionadas/);
  });

  it('gerencia aprueba con ítems adjudicados y queda registrado quién', async () => {
    const { service, prisma } = setup();
    prisma.solicitudCotizacion.findUnique.mockResolvedValue(
      solicitud({
        estado: 'aprobada_solicitante',
        cotizaciones: [{ id: 'c1', items: [{ id: 'i1', seleccionado: true }] }],
      }),
    );
    await service.avanzarEstadoSolicitud('s1', 'aprobada_gerencia', GERENCIA);
    expect(prisma.solicitudCotizacion.update.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        estado: 'aprobada_gerencia',
        aprobadaGerenciaPorId: 'ger',
        aprobadaGerenciaPorRole: 'gerencia',
      }),
    );
  });

  it('un supervisor solo aprueba como solicitante si creó el requerimiento', async () => {
    const { service, prisma } = setup();
    prisma.solicitudCotizacion.findUnique.mockResolvedValue(
      solicitud({ estado: 'seleccionada' }),
    );
    prisma.requerimiento.findUnique.mockResolvedValueOnce({
      creadoPorId: 'otro',
    });
    await expect(
      service.avanzarEstadoSolicitud('s1', 'aprobada_solicitante', SUPERVISOR),
    ).rejects.toBeInstanceOf(ForbiddenException);
    prisma.requerimiento.findUnique.mockResolvedValueOnce({
      creadoPorId: 'sup',
    });
    await service.avanzarEstadoSolicitud(
      's1',
      'aprobada_solicitante',
      SUPERVISOR,
    );
    expect(prisma.solicitudCotizacion.update.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ aprobadaSolicitantePorId: 'sup' }),
    );
    await service.avanzarEstadoSolicitud('s1', 'cancelada', LOGISTICA);
    expect(
      prisma.solicitudCotizacion.update.mock.calls[1][0].data.canceladaEn,
    ).toBeInstanceOf(Date);
  });

  it('reabrirSolicitud retoma una cancelada como borrador', async () => {
    const { service, prisma } = setup();
    prisma.solicitudCotizacion.findUnique.mockResolvedValueOnce(
      solicitud({ estado: 'enviada' }),
    );
    await expect(service.reabrirSolicitud('s1')).rejects.toThrow(/canceladas/);
    prisma.solicitudCotizacion.findUnique.mockResolvedValueOnce(
      solicitud({ estado: 'cancelada', requerimientoId: null }),
    );
    await expect(service.reabrirSolicitud('s1')).rejects.toThrow(
      /vinculadas a un requerimiento/,
    );
    prisma.solicitudCotizacion.findUnique.mockResolvedValue(
      solicitud({ estado: 'cancelada' }),
    );
    prisma.requerimiento.findUnique.mockResolvedValueOnce({
      id: 'r1',
      estado: 'recibido',
    });
    await expect(service.reabrirSolicitud('s1')).rejects.toThrow(
      /no está disponible/,
    );
    prisma.requerimiento.findUnique.mockResolvedValueOnce({
      id: 'r1',
      estado: 'en_cotizacion',
    });
    prisma.solicitudCotizacion.findFirst.mockResolvedValueOnce({
      codigo: 'SC-9',
    });
    await expect(service.reabrirSolicitud('s1')).rejects.toThrow(/SC-9/);
    prisma.requerimiento.findUnique.mockResolvedValueOnce({
      id: 'r1',
      estado: 'en_cotizacion',
    });
    await service.reabrirSolicitud('s1');
    expect(prisma.solicitudCotizacion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { estado: 'borrador', canceladaEn: null },
      }),
    );
  });
});

describe('CotizacionesService — adjudicación', () => {
  it('adjudica por ítem: gana la cotización con ítems elegidos', async () => {
    const { service, prisma } = setup();
    prisma.solicitudCotizacion.findUnique.mockResolvedValue(solicitud());
    await service.adjudicarSolicitud('s1', {
      adjudicaciones: [{ cotizacionItemId: 'i3' }],
    } as never);
    const updates = prisma.cotizacion.update.mock.calls.map((c: any) => [
      c[0].where.id,
      c[0].data.estado,
    ]);
    expect(updates).toEqual([
      ['c1', 'rechazada'],
      ['c2', 'aprobada'],
    ]);
    expect(prisma.solicitudCotizacion.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { estado: 'seleccionada' },
    });
  });

  it('valida estado, selección vacía e ítems ajenos', async () => {
    const { service, prisma } = setup();
    prisma.solicitudCotizacion.findUnique.mockResolvedValueOnce(
      solicitud({ estado: 'enviada' }),
    );
    await expect(
      service.adjudicarSolicitud('s1', { adjudicaciones: [] }),
    ).rejects.toThrow(/Solo se puede adjudicar/);
    prisma.solicitudCotizacion.findUnique.mockResolvedValueOnce(solicitud());
    await expect(
      service.adjudicarSolicitud('s1', { adjudicaciones: [] }),
    ).rejects.toThrow(/al menos un ítem/);
    prisma.solicitudCotizacion.findUnique.mockResolvedValueOnce(solicitud());
    await expect(
      service.adjudicarSolicitud('s1', {
        adjudicaciones: [{ cotizacionItemId: 'zz' }],
      } as never),
    ).rejects.toThrow(/no pertenecen/);
  });

  it('revertir la adjudicación vuelve a cotizada si no hay órdenes', async () => {
    const { service, prisma } = setup();
    prisma.solicitudCotizacion.findUnique.mockResolvedValueOnce(
      solicitud({ estado: 'cotizada' }),
    );
    await expect(service.revertirAdjudicacion('s1', GERENCIA)).rejects.toThrow(
      /antes de generar/,
    );
    prisma.solicitudCotizacion.findUnique.mockResolvedValue(
      solicitud({ estado: 'seleccionada' }),
    );
    prisma.ordenCompra.count.mockResolvedValueOnce(1);
    await expect(service.revertirAdjudicacion('s1', GERENCIA)).rejects.toThrow(
      /ya tiene órdenes/,
    );
    await service.revertirAdjudicacion('s1', GERENCIA);
    expect(prisma.solicitudCotizacion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: 'cotizada',
          aprobadaGerenciaEn: null,
        }),
      }),
    );
  });
});

describe('CotizacionesService — archivos', () => {
  it('sube, adjunta y elimina respetando permisos', async () => {
    const { service, prisma, storage } = setup();
    await service.subirArchivo({
      buffer: Buffer.from(''),
      originalname: 'c.pdf',
      mimetype: 'application/pdf',
    } as never);
    expect(storage.save).toHaveBeenCalledWith(
      expect.objectContaining({ folder: 'cotizaciones' }),
    );
    await expect(
      service.attachArchivo('x', { nombre: 'a', url: 'u' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    prisma.cotizacion.findUnique.mockResolvedValueOnce({ id: 'c1' });
    await service.attachArchivo('c1', { nombre: 'a', url: 'u' });
    expect(prisma.cotizacionArchivo.create).toHaveBeenCalledWith({
      data: { cotizacionId: 'c1', nombre: 'a', url: 'u' },
    });

    await expect(
      service.eliminarArchivo('c1', 'f1', LOGISTICA),
    ).rejects.toThrow(/Archivo f1/);
    prisma.cotizacionArchivo.findFirst.mockResolvedValue({
      id: 'f1',
      url: '/u/x.pdf',
    });
    await expect(
      service.eliminarArchivo('c1', 'f1', LOGISTICA),
    ).rejects.toThrow(/Cotizacion c1/);
    prisma.cotizacion.findUnique.mockResolvedValueOnce({
      solicitud: { estado: 'cancelada' },
    });
    await expect(
      service.eliminarArchivo('c1', 'f1', LOGISTICA),
    ).rejects.toBeInstanceOf(BadRequestException);
    prisma.cotizacion.findUnique.mockResolvedValueOnce({
      solicitud: { estado: 'aprobada_gerencia' },
    });
    await expect(
      service.eliminarArchivo('c1', 'f1', LOGISTICA),
    ).rejects.toBeInstanceOf(ForbiddenException);
    prisma.cotizacion.findUnique.mockResolvedValueOnce({
      solicitud: { estado: 'cotizada' },
    });
    storage.remove.mockRejectedValueOnce(new Error('no existe'));
    expect(await service.eliminarArchivo('c1', 'f1', LOGISTICA)).toEqual({
      success: true,
    });
    expect(prisma.cotizacionArchivo.delete).toHaveBeenCalledWith({
      where: { id: 'f1' },
    });
  });
});
