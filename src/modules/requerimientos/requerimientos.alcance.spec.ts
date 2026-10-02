import { jest } from '@jest/globals';
import { RequerimientosService } from './requerimientos.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { StorageProvider } from '../../shared/storage/storage.interface.js';
import type { EventEmitter2 } from '@nestjs/event-emitter';

describe('RequerimientosService listados con ?alcance=rol', () => {
  const prisma = {
    requerimiento: { findMany: jest.fn(), findUnique: jest.fn() },
  };
  const service = new RequerimientosService(
    prisma as unknown as PrismaService,
    {} as StorageProvider,
    { emit: jest.fn() } as unknown as EventEmitter2,
  );

  function whereDeLaUltimaConsulta() {
    const { calls } = prisma.requerimiento.findMany.mock;
    return (calls[calls.length - 1][0] as { where: Record<string, unknown> })
      .where;
  }

  beforeEach(() => {
    prisma.requerimiento.findMany.mockReset().mockResolvedValue([]);
  });

  it('los ings listan civil y eléctrico', async () => {
    await service.findAll({ alcance: 'rol' }, 'u-1', 'ing_civil');
    expect(whereDeLaUltimaConsulta().tipo).toEqual({
      in: ['civil', 'electrico'],
    });

    await service.findAll({ alcance: 'rol' }, 'u-2', 'ing_electrico');
    expect(whereDeLaUltimaConsulta().tipo).toEqual({
      in: ['civil', 'electrico'],
    });
  });

  it('Jefe SIG lista seguridad y administrativo', async () => {
    await service.findAll({ alcance: 'rol' }, 'u-1', 'jefe_sig');
    expect(whereDeLaUltimaConsulta().tipo).toEqual({
      in: ['seguridad', 'administrativo'],
    });
  });

  it('el historial aplica el mismo filtro por tipo', async () => {
    await service.findHistorial({ alcance: 'rol' }, 'u-1', 'jefe_sig');
    expect(whereDeLaUltimaConsulta().tipo).toEqual({
      in: ['seguridad', 'administrativo'],
    });
  });

  it('sin alcance no se filtra por tipo (selectores, reportes)', async () => {
    await service.findAll({ estado: 'aprobado' }, 'u-1', 'jefe_sig');
    expect(whereDeLaUltimaConsulta().tipo).toBeUndefined();
  });

  it('gerencia lista solo requerimientos con una solicitud esperando su aprobación', async () => {
    await service.findAll({ alcance: 'rol' }, 'u-1', 'gerencia');
    const where = whereDeLaUltimaConsulta();
    expect(where.solicitudes).toEqual({
      some: { estado: 'aprobada_solicitante' },
    });
    expect(where.tipo).toBeUndefined();
  });

  it('logística y administrador no se filtran', async () => {
    for (const rol of ['logistica', 'administrador'] as const) {
      await service.findAll({ alcance: 'rol' }, 'u-1', rol);
      const where = whereDeLaUltimaConsulta();
      expect(where.tipo).toBeUndefined();
      expect(where.solicitudes).toBeUndefined();
    }
  });

  it('el detalle por id nunca se filtra por rol ni por tipo', async () => {
    prisma.requerimiento.findUnique.mockResolvedValue({
      id: 'r-seg',
      tipo: 'seguridad',
    });

    await expect(service.findOne('r-seg')).resolves.toEqual(
      expect.objectContaining({ id: 'r-seg', tipo: 'seguridad' }),
    );
    expect(prisma.requerimiento.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r-seg' } }),
    );
  });
});
