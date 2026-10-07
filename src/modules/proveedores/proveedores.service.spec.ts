import { NotFoundException } from '@nestjs/common';
import { ProveedoresService } from './proveedores.service.js';
import { Prisma } from '../../../prisma/generated/prisma/client.js';
import { prismaMock, type PrismaMock } from '../../testing/mocks.js';

function setup() {
  const prisma: PrismaMock = prismaMock();
  prisma.proveedor.findUnique.mockResolvedValue({ id: 'pA', contactos: [] });
  return { prisma, service: new ProveedoresService(prisma as never) };
}

const d = (iso: string) => new Date(iso);
const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('dup', {
    code: 'P2002',
    clientVersion: '7',
  });

describe('ProveedoresService.evaluacion (RF-P04)', () => {
  it('pondera precio 40%, plazos 30% y calidad 30%', async () => {
    const { service, prisma } = setup();
    prisma.cotizacionItem.findMany
      .mockResolvedValueOnce([
        { precioUnit: '10', solicitudItemId: 'si1' },
        { precioUnit: '20', solicitudItemId: 'si2' },
      ])
      .mockResolvedValueOnce([
        { precioUnit: '10', solicitudItemId: 'si1' },
        { precioUnit: '12', solicitudItemId: 'si1' },
        { precioUnit: '20', solicitudItemId: 'si2' },
        { precioUnit: '10', solicitudItemId: 'si2' },
      ]);
    prisma.ordenCompra.findMany.mockResolvedValue([
      {
        fechaEntrega: d('2026-09-10'),
        fechaEntregaReal: d('2026-09-09'),
        calificacionCalidad: 4,
      },
      {
        fechaEntrega: d('2026-09-10'),
        fechaEntregaReal: d('2026-09-12'),
        calificacionCalidad: null,
      },
    ]);
    const r = await service.evaluacion('pA');
    // precio: (1 + 0.5)/2 = 0.75; plazos: 1/2; calidad: 4/5 = 0.8
    expect(r).toEqual({
      puntajeTotal: 69,
      precioScore: 75,
      plazosScore: 50,
      calidadScore: 80,
      muestraCotizaciones: 2,
      muestraOCs: 2,
    });
  });

  it('un proveedor nuevo sin datos no recibe puntaje', async () => {
    const { service } = setup();
    expect(await service.evaluacion('pA')).toEqual({
      puntajeTotal: null,
      precioScore: null,
      plazosScore: null,
      calidadScore: null,
      muestraCotizaciones: 0,
      muestraOCs: 0,
    });
  });

  it('renormaliza pesos cuando falta un componente y tolera precio cero', async () => {
    const { service, prisma } = setup();
    prisma.cotizacionItem.findMany
      .mockResolvedValueOnce([{ precioUnit: '0', solicitudItemId: 'si1' }])
      .mockResolvedValueOnce([]);
    expect((await service.evaluacion('pA')).puntajeTotal).toBe(100);
  });

  it('falla si el proveedor no existe', async () => {
    const { service, prisma } = setup();
    prisma.proveedor.findUnique.mockResolvedValue(null);
    await expect(service.evaluacion('x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('ProveedoresService.findAll', () => {
  it('suma actividad, monto reciente y puntaje por proveedor', async () => {
    const { service, prisma } = setup();
    prisma.proveedor.findMany.mockResolvedValue([
      { id: 'pA', razonSocial: 'A' },
      { id: 'pB', razonSocial: 'B' },
      { id: 'pC', razonSocial: 'C' },
    ]);
    prisma.ordenCompra.groupBy
      .mockResolvedValueOnce([
        {
          proveedorId: 'pA',
          _count: { _all: 3 },
          _sum: { montoTotal: '3000' },
          _max: { creadoEn: d('2026-09-01') },
        },
        {
          proveedorId: null,
          _count: { _all: 1 },
          _sum: { montoTotal: '5' },
          _max: { creadoEn: null },
        },
      ])
      .mockResolvedValueOnce([
        { proveedorId: 'pA', _sum: { montoTotal: '1000' } },
        { proveedorId: null, _sum: { montoTotal: null } },
      ]);
    prisma.cotizacion.groupBy.mockResolvedValueOnce([
      { proveedorId: 'pA', _max: { creadoEn: d('2026-09-15') } },
      { proveedorId: 'pB', _max: { creadoEn: d('2026-08-01') } },
    ]);
    prisma.cotizacionItem.findMany
      .mockResolvedValueOnce([
        {
          precioUnit: '10',
          solicitudItemId: 'si1',
          cotizacion: { proveedorId: 'pA' },
        },
      ])
      .mockResolvedValueOnce([
        { precioUnit: '8', solicitudItemId: 'si1' },
        { precioUnit: '10', solicitudItemId: 'si1' },
      ]);
    prisma.ordenCompra.findMany.mockResolvedValueOnce([
      {
        proveedorId: 'pA',
        fechaEntrega: d('2026-09-10'),
        fechaEntregaReal: d('2026-09-10'),
        calificacionCalidad: 5,
      },
    ]);
    const lista = await service.findAll({ nombre: 'a' });
    expect(
      prisma.proveedor.findMany.mock.calls[0][0].where.razonSocial,
    ).toEqual({ contains: 'a', mode: 'insensitive' });
    const a = lista.find((p) => p.id === 'pA')!;
    expect(a.actividad).toEqual({
      ordenes: 3,
      montoTotal: 3000,
      monto90d: 1000,
      ultimaActividad: d('2026-09-15'),
      puntaje: 92,
    });
    expect(lista.find((p) => p.id === 'pB')!.actividad).toEqual(
      expect.objectContaining({
        ordenes: 0,
        ultimaActividad: d('2026-08-01'),
        puntaje: null,
      }),
    );
    expect(lista.find((p) => p.id === 'pC')!.actividad).toEqual({
      ordenes: 0,
      montoTotal: 0,
      monto90d: 0,
      ultimaActividad: null,
      puntaje: null,
    });
  });

  it('sin proveedores no calcula puntajes', async () => {
    const { service, prisma } = setup();
    expect(await service.findAll({})).toEqual([]);
    expect(prisma.cotizacionItem.findMany).not.toHaveBeenCalled();
  });
});

describe('ProveedoresService — CRUD', () => {
  it('traduce el RUC duplicado a un mensaje legible', async () => {
    const { service, prisma } = setup();
    prisma.proveedor.create.mockRejectedValueOnce(p2002());
    await expect(
      service.create({ razonSocial: 'X', ruc: '20123456789' } as never),
    ).rejects.toThrow(
      'Ya existe un proveedor registrado con el RUC 20123456789',
    );
    prisma.proveedor.update.mockRejectedValueOnce(p2002());
    await expect(service.update('pA', { razonSocial: 'X' })).rejects.toThrow(
      'Ya existe un proveedor con esos datos',
    );
    prisma.proveedor.create.mockRejectedValueOnce(new Error('otro'));
    await expect(service.create({} as never)).rejects.toThrow('otro');
    await service.create({ razonSocial: 'Y' } as never);
    await service.update('pA', { razonSocial: 'Z' });
    expect(prisma.proveedor.update).toHaveBeenLastCalledWith({
      where: { id: 'pA' },
      data: { razonSocial: 'Z' },
    });
  });

  it('gestiona contactos y el principal', async () => {
    const { service, prisma } = setup();
    await service.findContactos('pA');
    await service.createContacto('pA', { nombre: 'Luis' });
    expect(prisma.contactoProveedor.create).toHaveBeenCalledWith({
      data: { nombre: 'Luis', proveedorId: 'pA' },
    });
    await expect(service.updateContacto('pA', 'c1', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.setPrincipalContacto('pA', 'c1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    prisma.contactoProveedor.findFirst.mockResolvedValue({ id: 'c1' });
    await service.updateContacto('pA', 'c1', { cargo: 'Ventas' });
    await service.setPrincipalContacto('pA', 'c1');
    expect(prisma.contactoProveedor.updateMany).toHaveBeenCalledWith({
      where: { proveedorId: 'pA' },
      data: { esPrincipal: false },
    });
  });

  it('consulta historial de ítems y cotizaciones', async () => {
    const { service, prisma } = setup();
    await service.findItemsSolicitados('pA');
    await service.findCotizaciones('pA');
    expect(prisma.cotizacion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { proveedorId: 'pA' } }),
    );
  });

  it('gestiona el catálogo de productos', async () => {
    const { service, prisma } = setup();
    await service.createCatalogoItem('pA', {
      descripcion: 'Cemento',
      precioRef: 25,
    });
    expect(prisma.catalogoProductoProveedor.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ unidad: 'und' }),
    });
    await expect(
      service.updateCatalogoItem('pA', 'i1', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteCatalogoItem('pA', 'i1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    prisma.catalogoProductoProveedor.findFirst.mockResolvedValue({ id: 'i1' });
    await service.updateCatalogoItem('pA', 'i1', { precioRef: 26 });
    await service.deleteCatalogoItem('pA', 'i1');
    expect(prisma.catalogoProductoProveedor.delete).toHaveBeenCalledWith({
      where: { id: 'i1' },
    });
  });

  it('findOne falla si no existe', async () => {
    const { service, prisma } = setup();
    prisma.proveedor.findUnique.mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.createContacto('x', {} as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
