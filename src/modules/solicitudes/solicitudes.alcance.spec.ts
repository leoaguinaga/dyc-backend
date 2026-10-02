import { jest } from '@jest/globals';
import { SolicitudesService } from './solicitudes.service.js';

describe('SolicitudesService.findAll con ?alcance=rol', () => {
  const prisma = {
    requerimiento: { findMany: jest.fn() },
    compraSimple: { findMany: jest.fn() },
  };
  const service = new SolicitudesService(prisma as never);

  const proyecto = { id: 'p-1', codigo: 'OB-01', nombre: 'Obra 1' };
  const creadoPor = { id: 'u-1', name: 'Supervisor' };

  function requerimiento(solicitudes: Array<{ id: string; estado: string }>) {
    return {
      id: 'r-1',
      codigo: 'REQ-001',
      nombre: 'Concreto',
      tipo: 'civil',
      estado: 'en_cotizacion',
      urgente: false,
      notaRevision: null,
      fechaEntregaRequerida: null,
      creadoEn: new Date('2026-09-01T12:00:00.000Z'),
      recepcionEn: null,
      actualizadoEn: new Date('2026-09-01T12:00:00.000Z'),
      historial: [],
      proyecto,
      creadoPor,
      _count: { items: 1 },
      solicitudes: solicitudes.map((solicitud) => ({
        ...solicitud,
        codigo: `SC-${solicitud.id}`,
        cotizaciones: [],
        ordenes: [],
      })),
    };
  }

  beforeEach(() => {
    prisma.requerimiento.findMany.mockReset().mockResolvedValue([]);
    prisma.compraSimple.findMany.mockReset().mockResolvedValue([]);
  });

  it('un ing solo consulta requerimientos y compras civil/eléctrico', async () => {
    await service.findAll({ alcance: 'rol' }, 'u-ing', 'ing_civil');

    const tipo = { in: ['civil', 'electrico'] };
    expect(prisma.requerimiento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tipo } }),
    );
    expect(prisma.compraSimple.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tipo } }),
    );
  });

  it('Jefe SIG solo consulta seguridad y administrativo', async () => {
    await service.findAll({ alcance: 'rol' }, 'u-sig', 'jefe_sig');

    const tipo = { in: ['seguridad', 'administrativo'] };
    expect(prisma.requerimiento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tipo } }),
    );
    expect(prisma.compraSimple.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tipo } }),
    );
  });

  it('sin alcance no filtra por tipo aunque el rol sea ing', async () => {
    await service.findAll({}, 'u-ing', 'ing_electrico');

    expect(prisma.requerimiento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('logística y administrador quedan sin filtro', async () => {
    await service.findAll({ alcance: 'rol' }, 'u-log', 'logistica');
    await service.findAll({ alcance: 'rol' }, 'u-adm', 'administrador');

    for (const [args] of prisma.requerimiento.findMany.mock.calls) {
      expect(args).toEqual(expect.objectContaining({ where: {} }));
    }
  });

  it('gerencia en la vista activa solo consulta lo que espera su aprobación', async () => {
    await service.findAll(
      { alcance: 'rol', vista: 'activas' },
      'u-ger',
      'gerencia',
    );

    expect(prisma.requerimiento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { solicitudes: { some: { estado: 'aprobada_solicitante' } } },
      }),
    );
    expect(prisma.compraSimple.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          grupos: {
            some: {
              estadoAprobacion: 'aprobada_tecnico',
              estado: { notIn: ['cancelada', 'recibida'] },
            },
          },
        },
      }),
    );
  });

  it('el historial de gerencia no se acota', async () => {
    await service.findAll(
      { alcance: 'rol', vista: 'historial' },
      'u-ger',
      'gerencia',
    );

    expect(prisma.requerimiento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('gerencia ve el requerimiento en su columna y la tarjeta abre la cotización a aprobar', async () => {
    // Otra solicitud sigue cotizándose: sin el override caería en
    // "Cotización y selección", columna que gerencia no tiene.
    prisma.requerimiento.findMany.mockResolvedValue([
      requerimiento([
        { id: 'sc-en-curso', estado: 'enviada' },
        { id: 'sc-por-aprobar', estado: 'aprobada_solicitante' },
      ]),
    ]);

    const result = await service.findAll(
      { alcance: 'rol', vista: 'activas' },
      'u-ger',
      'gerencia',
    );

    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'r-1',
        columnaKanban: 'aprobacion_gerencia',
        hrefDetalle: '/cotizaciones/sc-por-aprobar',
      }),
    ]);
  });

  it('para el resto de roles el requerimiento conserva su columna y su enlace', async () => {
    prisma.requerimiento.findMany.mockResolvedValue([
      requerimiento([
        { id: 'sc-en-curso', estado: 'enviada' },
        { id: 'sc-por-aprobar', estado: 'aprobada_solicitante' },
      ]),
    ]);

    const result = await service.findAll(
      { alcance: 'rol', vista: 'activas' },
      'u-log',
      'logistica',
    );

    expect(result.data).toEqual([
      expect.objectContaining({
        columnaKanban: 'cotizacion_seleccion',
        hrefDetalle: '/requerimientos/r-1',
      }),
    ]);
  });
});
