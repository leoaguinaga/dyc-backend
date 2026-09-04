import type {
  EstadoAprobacionCompra,
  EstadoOrdenCompra,
} from '../../prisma/types.js';
import { jest } from '@jest/globals';
import { SolicitudesService } from './solicitudes.service.js';

describe('SolicitudesService', () => {
  const prisma = {
    requerimiento: { findMany: jest.fn() },
    compraSimple: { findMany: jest.fn() },
  };
  const service = new SolicitudesService(prisma as never);

  beforeEach(() => {
    prisma.requerimiento.findMany.mockResolvedValue([]);
    prisma.compraSimple.findMany.mockResolvedValue([]);
  });

  it('conserva el estado observado de una compra precotizada', async () => {
    prisma.compraSimple.findMany.mockResolvedValue([
      {
        id: 'cs-1',
        codigo: 'CS-001',
        nombre: 'Materiales urgentes',
        tipo: 'electrico',
        esRendicion: false,
        creadoEn: new Date('2026-08-31T12:00:00.000Z'),
        proyecto: { id: 'p-1', codigo: 'OB-01', nombre: 'Obra 1' },
        creadoPor: { id: 'u-1', name: 'Supervisor' },
        grupos: [
          {
            id: 'g-1',
            numero: 'OC-001',
            nombre: 'Material eléctrico',
            tipo: 'compra',
            estado: 'borrador' as EstadoOrdenCompra,
            estadoAprobacion: 'observada' as EstadoAprobacionCompra,
            montoTotal: 150,
            proveedorId: 'prov-1',
            proveedorNombreLibre: null,
            proveedor: { id: 'prov-1', razonSocial: 'Proveedor Uno' },
            _count: { items: 2, pagos: 0, archivos: 1 },
          },
        ],
      },
    ]);

    const result = await service.findAll({}, 'u-1', 'supervisor');

    expect(result).toEqual({
      data: [
        expect.objectContaining({
          origen: 'precotizado',
          tipo: 'electrico',
          etapa: 'observada',
          columnaKanban: 'requiere_correccion',
          estadoNativo: 'observada',
          requiereAtencion: true,
          esTerminal: false,
          hrefDetalle: '/compras-simples/cs-1',
          resumenGrupos: { total: 1, pendientes: 0, observados: 1 },
          flujo: {
            origen: 'precotizado',
            esRendicion: false,
            grupos: [
              expect.objectContaining({
                id: 'g-1',
                estado: 'borrador',
                estadoAprobacion: 'observada',
                montoTotal: 150,
                items: 2,
                archivos: 1,
              }),
            ],
            aprobaciones: { total: 1, porEstado: { observada: 1 } },
            ordenes: { total: 1, porEstado: { borrador: 1 } },
            montoTotal: 150,
          },
        }),
      ],
      total: 1,
    });
    expect(prisma.compraSimple.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { creadoPorId: 'u-1' } }),
    );
  });

  it('ordena ambos orígenes por creación y aplica la etapa solicitada', async () => {
    prisma.requerimiento.findMany.mockResolvedValue([
      {
        id: 'r-1',
        codigo: 'REQ-001',
        nombre: 'Concreto',
        tipo: 'civil',
        estado: 'en_cotizacion',
        urgente: false,
        notaRevision: null,
        fechaEntregaRequerida: new Date('2026-09-10T12:00:00.000Z'),
        creadoEn: new Date('2026-08-30T12:00:00.000Z'),
        proyecto: { id: 'p-1', codigo: 'OB-01', nombre: 'Obra 1' },
        creadoPor: { id: 'u-1', name: 'Supervisor' },
        _count: { items: 3 },
        solicitudes: [
          {
            id: 'sc-1',
            codigo: 'SC-001',
            estado: 'cotizada',
            cotizaciones: [{ estado: 'recibida' }, { estado: 'pendiente' }],
            ordenes: [{ estado: 'borrador' }],
          },
        ],
      },
    ]);
    prisma.compraSimple.findMany.mockResolvedValue([
      {
        id: 'cs-2',
        codigo: 'CS-002',
        nombre: 'Herramientas',
        tipo: 'seguridad',
        esRendicion: true,
        creadoEn: new Date('2026-08-31T12:00:00.000Z'),
        proyecto: { id: 'p-1', codigo: 'OB-01', nombre: 'Obra 1' },
        creadoPor: { id: 'u-1', name: 'Supervisor' },
        grupos: [
          {
            id: 'g-2',
            numero: 'OC-002',
            nombre: 'Herramientas',
            tipo: 'compra',
            estado: 'borrador' as EstadoOrdenCompra,
            estadoAprobacion: 'pendiente' as EstadoAprobacionCompra,
            montoTotal: 80,
            proveedorId: null,
            proveedorNombreLibre: 'Ferretería local',
            proveedor: null,
            _count: { items: 1, pagos: 0, archivos: 1 },
          },
        ],
      },
    ]);

    const result = await service.findAll(
      { etapa: 'en_cotizacion' },
      'u-1',
      'supervisor',
    );

    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'r-1',
        origen: 'macro',
        tipo: 'civil',
        etapa: 'en_cotizacion',
        columnaKanban: 'cotizacion_seleccion',
        requiereAtencion: false,
        esTerminal: false,
        flujo: {
          origen: 'macro',
          requerimiento: {
            estado: 'en_cotizacion',
            urgente: false,
            notaRevision: null,
            fechaEntregaRequerida: '2026-09-10T12:00:00.000Z',
            items: 3,
          },
          solicitudesCotizacion: [
            {
              id: 'sc-1',
              codigo: 'SC-001',
              estado: 'cotizada',
              cotizaciones: {
                total: 2,
                porEstado: { recibida: 1, pendiente: 1 },
              },
              ordenes: { total: 1, porEstado: { borrador: 1 } },
            },
          ],
        },
      }),
    ]);
    expect(result.total).toBe(1);
  });

  it('marca como mixta una precotizada con grupos en etapas distintas', async () => {
    prisma.compraSimple.findMany.mockResolvedValue([
      {
        id: 'cs-3',
        codigo: 'CS-003',
        nombre: 'Compra dividida',
        tipo: 'civil',
        esRendicion: false,
        creadoEn: new Date('2026-09-01T12:00:00.000Z'),
        proyecto: { id: 'p-1', codigo: 'OB-01', nombre: 'Obra 1' },
        creadoPor: { id: 'u-1', name: 'Supervisor' },
        grupos: [
          {
            id: 'g-3',
            numero: 'OC-003',
            nombre: 'Grupo emitido',
            tipo: 'compra',
            estado: 'emitida' as EstadoOrdenCompra,
            estadoAprobacion: 'aprobada' as EstadoAprobacionCompra,
            montoTotal: 120,
            proveedorId: null,
            proveedorNombreLibre: 'Proveedor A',
            proveedor: null,
            _count: { items: 1, pagos: 0, archivos: 0 },
          },
          {
            id: 'g-4',
            numero: 'OC-004',
            nombre: 'Grupo pendiente',
            tipo: 'compra',
            estado: 'borrador' as EstadoOrdenCompra,
            estadoAprobacion: 'pendiente' as EstadoAprobacionCompra,
            montoTotal: 90,
            proveedorId: null,
            proveedorNombreLibre: 'Proveedor B',
            proveedor: null,
            _count: { items: 1, pagos: 0, archivos: 0 },
          },
        ],
      },
    ]);

    const result = await service.findAll({}, 'u-1', 'supervisor');

    expect(result.data[0]).toEqual(
      expect.objectContaining({
        etapa: 'mixta',
        columnaKanban: 'validacion_tecnica',
        estadoNativo: 'grupos_mixtos',
        requiereAtencion: false,
        esTerminal: false,
      }),
    );
  });

  it('deja los borradores fuera de la proyección operativa del kanban', async () => {
    prisma.requerimiento.findMany.mockResolvedValue([
      {
        id: 'r-borrador',
        codigo: 'REQ-000',
        nombre: 'Solicitud incompleta',
        tipo: 'civil',
        estado: 'borrador',
        urgente: false,
        notaRevision: null,
        fechaEntregaRequerida: null,
        creadoEn: new Date('2026-09-02T12:00:00.000Z'),
        proyecto: { id: 'p-1', codigo: 'OB-01', nombre: 'Obra 1' },
        creadoPor: { id: 'u-1', name: 'Supervisor' },
        _count: { items: 1 },
        solicitudes: [],
      },
    ]);
    prisma.compraSimple.findMany.mockResolvedValue([
      {
        id: 'cs-borrador',
        codigo: 'CS-000',
        nombre: 'Precotizada incompleta',
        tipo: 'civil',
        esRendicion: false,
        creadoEn: new Date('2026-09-02T13:00:00.000Z'),
        proyecto: { id: 'p-1', codigo: 'OB-01', nombre: 'Obra 1' },
        creadoPor: { id: 'u-1', name: 'Supervisor' },
        grupos: [],
      },
    ]);

    const result = await service.findAll({}, 'u-1', 'supervisor');

    expect(result.data).toEqual([
      expect.objectContaining({ id: 'cs-borrador', columnaKanban: null }),
      expect.objectContaining({ id: 'r-borrador', columnaKanban: null }),
    ]);

    const activas = await service.findAll(
      { vista: 'activas' },
      'u-1',
      'supervisor',
    );
    expect(activas).toEqual({ data: [], total: 0 });
  });
});
