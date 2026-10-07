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

describe('RequerimientosService — coordinador SSOMA (obras asignadas)', () => {
  const prisma = {
    requerimiento: { findMany: jest.fn(), findUnique: jest.fn() },
    proyectoSupervisor: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const events = { emit: jest.fn() };
  const service = new RequerimientosService(
    prisma as unknown as PrismaService,
    {} as StorageProvider,
    events as unknown as EventEmitter2,
  );

  const asignado = (si: boolean) =>
    prisma.proyectoSupervisor.findUnique.mockResolvedValue(
      si ? { userId: 'u-ssoma' } : null,
    );
  const enviado = (tipo: string, extra: object = {}) =>
    prisma.requerimiento.findUnique.mockResolvedValue({
      id: 'r1',
      codigo: 'REQ-1',
      nombre: 'EPP',
      estado: 'enviado',
      tipo,
      proyectoId: 'p1',
      creadoPorId: 'otro',
      ...extra,
    });

  beforeEach(() => {
    prisma.requerimiento.findMany.mockReset().mockResolvedValue([]);
    prisma.requerimiento.findUnique.mockReset();
    prisma.proyectoSupervisor.findUnique.mockReset();
    prisma.$transaction.mockReset();
    events.emit.mockReset();
  });

  const whereDeLaUltimaConsulta = () => {
    const { calls } = prisma.requerimiento.findMany.mock;
    return (calls[calls.length - 1][0] as { where: Record<string, unknown> })
      .where;
  };

  it('el listado y el historial se acotan a sus obras, sin limitarlo a lo que creó', async () => {
    await service.findAll({}, 'u-ssoma', 'coordinador_ssoma');
    expect(whereDeLaUltimaConsulta().proyecto).toEqual({
      supervisores: { some: { userId: 'u-ssoma' } },
    });
    expect(whereDeLaUltimaConsulta().creadoPorId).toBeUndefined();

    await service.findHistorial({}, 'u-ssoma', 'coordinador_ssoma');
    expect(whereDeLaUltimaConsulta().proyecto).toEqual({
      supervisores: { some: { userId: 'u-ssoma' } },
    });
  });

  it('con ?alcance=rol además solo ve seguridad', async () => {
    await service.findAll({ alcance: 'rol' }, 'u-ssoma', 'coordinador_ssoma');
    expect(whereDeLaUltimaConsulta().tipo).toEqual({ in: ['seguridad'] });
  });

  it('el resto de los roles no se acota por obra', async () => {
    await service.findAll({}, 'u-1', 'jefe_sig');
    expect(whereDeLaUltimaConsulta().proyecto).toBeUndefined();
  });

  it('no abre el detalle de una obra donde no está asignado', async () => {
    enviado('seguridad');
    asignado(false);
    await expect(
      service.findOne('r1', { id: 'u-ssoma', role: 'coordinador_ssoma' }),
    ).rejects.toThrow('No estás asignado a esta obra');
  });

  it('no aprueba ni observa en una obra ajena', async () => {
    enviado('seguridad');
    asignado(false);
    await expect(
      service.aprobar('r1', 'u-ssoma', 'coordinador_ssoma'),
    ).rejects.toThrow('No estás asignado a esta obra');
    await expect(
      service.observar(
        'r1',
        { notaRevision: 'x' },
        'u-ssoma',
        'coordinador_ssoma',
      ),
    ).rejects.toThrow('No estás asignado a esta obra');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('aun asignado, solo decide requerimientos de seguridad', async () => {
    enviado('civil');
    asignado(true);
    await expect(
      service.aprobar('r1', 'u-ssoma', 'coordinador_ssoma'),
    ).rejects.toThrow('no puede aprobar requerimientos de tipo "civil"');
  });

  it('no aprueba un requerimiento que él mismo creó', async () => {
    enviado('seguridad', { creadoPorId: 'u-ssoma' });
    asignado(true);
    await expect(
      service.aprobar('r1', 'u-ssoma', 'coordinador_ssoma'),
    ).rejects.toThrow('El creador de un requerimiento no puede aprobarlo');
  });

  it('aprueba seguridad en una obra asignada', async () => {
    enviado('seguridad');
    asignado(true);
    prisma.$transaction.mockImplementation((cb: unknown) =>
      (cb as (tx: unknown) => unknown)({
        requerimiento: {
          update: jest.fn().mockResolvedValue({ id: 'r1', estado: 'aprobado' }),
        },
        requerimientoHistorial: { create: jest.fn() },
      }),
    );
    await expect(
      service.aprobar('r1', 'u-ssoma', 'coordinador_ssoma'),
    ).resolves.toEqual({ id: 'r1', estado: 'aprobado' });
    expect(events.emit).toHaveBeenCalled();
  });

  it('crea requerimientos solo en sus obras y solo de seguridad', async () => {
    const dto = {
      nombre: 'EPP',
      proyectoId: 'p2',
      tipo: 'seguridad',
      items: [],
    };
    asignado(false);
    await expect(
      service.create(dto as never, 'u-ssoma', 'coordinador_ssoma'),
    ).rejects.toThrow('No estás asignado a esta obra');
    await expect(
      service.create(
        { ...dto, tipo: 'civil' } as never,
        'u-ssoma',
        'coordinador_ssoma',
      ),
    ).rejects.toThrow('no puede crear requerimientos de tipo "civil"');
  });
});
