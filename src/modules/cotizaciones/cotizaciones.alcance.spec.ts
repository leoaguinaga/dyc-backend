import { jest } from '@jest/globals';
import { CotizacionesService } from './cotizaciones.service.js';

describe('CotizacionesService listados con ?alcance=rol', () => {
  const prisma = {
    solicitudCotizacion: { findMany: jest.fn(), findUnique: jest.fn() },
  };
  const service = new CotizacionesService(
    prisma as never,
    { emit: jest.fn() } as never,
    {} as never,
  );

  function whereDeLaUltimaConsulta() {
    const { calls } = prisma.solicitudCotizacion.findMany.mock;
    return (calls[calls.length - 1][0] as { where: Record<string, unknown> })
      .where;
  }

  beforeEach(() => {
    prisma.solicitudCotizacion.findMany.mockReset().mockResolvedValue([]);
  });

  it('los ings listan cotizaciones de requerimientos civil y eléctrico', async () => {
    await service.findAllSolicitudes({ alcance: 'rol' }, 'ing_civil');

    expect(whereDeLaUltimaConsulta().requerimiento).toEqual({
      tipo: { in: ['civil', 'electrico'] },
    });
  });

  it('Jefe SIG lista seguridad y administrativo, también en el historial', async () => {
    await service.findAllSolicitudes({ alcance: 'rol' }, 'jefe_sig');
    expect(whereDeLaUltimaConsulta().requerimiento).toEqual({
      tipo: { in: ['seguridad', 'administrativo'] },
    });

    await service.findHistorialSolicitudes({ alcance: 'rol' }, 'jefe_sig');
    expect(whereDeLaUltimaConsulta().requerimiento).toEqual({
      tipo: { in: ['seguridad', 'administrativo'] },
    });
  });

  it('gerencia lista solo las solicitudes que esperan su aprobación', async () => {
    await service.findAllSolicitudes(
      { alcance: 'rol', estado: 'borrador' },
      'gerencia',
    );

    const where = whereDeLaUltimaConsulta();
    expect(where.estado).toBe('aprobada_solicitante');
    expect(where.requerimiento).toBeUndefined();
  });

  it('el historial de gerencia no se acota', async () => {
    await service.findHistorialSolicitudes({ alcance: 'rol' }, 'gerencia');

    const where = whereDeLaUltimaConsulta();
    expect(where.estado).toBeUndefined();
    expect(where.requerimiento).toBeUndefined();
  });

  it('sin alcance la lista es completa para cualquier rol', async () => {
    await service.findAllSolicitudes({}, 'gerencia');
    expect(whereDeLaUltimaConsulta().estado).toBeUndefined();

    await service.findAllSolicitudes({}, 'ing_civil');
    expect(whereDeLaUltimaConsulta().requerimiento).toBeUndefined();
  });

  it('logística y administrador no se filtran', async () => {
    for (const rol of ['logistica', 'administrador'] as const) {
      await service.findAllSolicitudes({ alcance: 'rol' }, rol);
      const where = whereDeLaUltimaConsulta();
      expect(where.requerimiento).toBeUndefined();
      expect(where.estado).toBeUndefined();
    }
  });

  it('el detalle por id nunca se filtra por rol ni por tipo', async () => {
    prisma.solicitudCotizacion.findUnique.mockResolvedValue({
      id: 'sc-1',
      requerimiento: { tipo: 'seguridad' },
    });

    await expect(service.findOneSolicitud('sc-1')).resolves.toEqual(
      expect.objectContaining({ id: 'sc-1' }),
    );
    expect(prisma.solicitudCotizacion.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sc-1' } }),
    );
  });
});
