import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AsistenciasService } from './asistencias.service.js';
import { hoyLima } from '../../shared/date/fecha.util.js';
import { fn, prismaMock, type PrismaMock } from '../../testing/mocks.js';

const FECHA = new Date(Date.UTC(2026, 8, 15)); // 15/09/2026
const DIA = {
  horaInicio: '08:00',
  horaFin: '17:00',
  cruzaMedianoche: false,
  toleranciaMinutos: 10,
  toleranciaSalidaMinutos: 60,
  topeCierreHoras: 4,
};
const NOCHE = {
  horaInicio: '22:00',
  horaFin: '06:00',
  cruzaMedianoche: true,
  toleranciaMinutos: 10,
  toleranciaSalidaMinutos: 60,
  topeCierreHoras: 4,
};

// Instante real (UTC) a partir de una hora de Lima del día indicado.
const lima = (fecha: Date, hhmm: string, diasDespues = 0) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(
    Date.UTC(
      fecha.getUTCFullYear(),
      fecha.getUTCMonth(),
      fecha.getUTCDate() + diasDespues,
      h + 5,
      m,
    ),
  );
};

function setup() {
  const prisma: PrismaMock = prismaMock();
  const storage = {
    save: fn(() => Promise.resolve({ url: '/uploads/asistencias/foto.jpg' })),
  };
  const service = new AsistenciasService(prisma as never, storage as never);
  return { prisma, storage, service };
}

const obrero = (id: string, nombre = id) => ({
  trabajadorId: id,
  trabajador: { nombre, dni: '1', cargo: 'Operario' },
});
const turnoAbierto = (extra: object = {}) => ({
  id: 't1',
  proyectoId: 'p1',
  fecha: FECHA,
  turnoConfigId: 'cfg',
  estado: 'abierto',
  fotoUrl: 'foto.jpg',
  fotoOmitida: false,
  horaCierreReal: null,
  ...extra,
});

describe('AsistenciasService — consultas', () => {
  it('findTurnos lista las jornadas de la obra', async () => {
    const { service, prisma } = setup();
    await service.findTurnos('p1');
    expect(prisma.turno.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { proyectoId: 'p1' } }),
    );
  });

  it('findTurnoDetalle cruza obreros asignados con su asistencia', async () => {
    const { service, prisma } = setup();
    prisma.turno.findFirst.mockResolvedValue({
      ...turnoAbierto(),
      asistencias: [{ trabajadorId: 'a', estado: 'presente' }],
    });
    prisma.proyectoTrabajador.findMany.mockResolvedValue([
      obrero('a'),
      obrero('b'),
    ]);
    const detalle = await service.findTurnoDetalle('p1', 't1');
    expect(detalle.obreros).toEqual([
      expect.objectContaining({
        trabajadorId: 'a',
        asistencia: { trabajadorId: 'a', estado: 'presente' },
      }),
      expect.objectContaining({ trabajadorId: 'b', asistencia: null }),
    ]);
  });

  it('findTurnoDetalle falla si la jornada no existe', async () => {
    const { service } = setup();
    await expect(service.findTurnoDetalle('p1', 'x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('obrerosParaHoja devuelve los asignados ordenados por nombre', async () => {
    const { service, prisma } = setup();
    prisma.proyectoTrabajador.findMany.mockResolvedValue([
      obrero('b', 'Zoila'),
      obrero('a', 'Ana'),
    ]);
    const lista = await service.obrerosParaHoja('p1', '2026-09-15', 'cfg');
    expect(lista.map((o) => o.nombre)).toEqual(['Ana', 'Zoila']);
  });
});

describe('AsistenciasService.abrirTurno', () => {
  const hoyIso = () => hoyLima().toISOString().slice(0, 10);

  it('abre la jornada de hoy', async () => {
    const { service, prisma } = setup();
    prisma.turnoConfig.findFirst.mockResolvedValue({ id: 'cfg', ...DIA });
    await service.abrirTurno('p1', 'u1', 'pdr', {
      turnoConfigId: 'cfg',
    });
    expect(prisma.turno.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        proyectoId: 'p1',
        turnoConfigId: 'cfg',
        abiertoPorId: 'u1',
        fecha: hoyLima(),
      }),
    });
  });

  it('rechaza un horario inexistente o inactivo', async () => {
    const { service } = setup();
    await expect(
      service.abrirTurno('p1', 'u1', 'pdr', { turnoConfigId: 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('una fecha pasada exige rol de administración y motivo', async () => {
    const { service, prisma } = setup();
    prisma.turnoConfig.findFirst.mockResolvedValue({ id: 'cfg', ...DIA });
    const dto = { turnoConfigId: 'cfg', fecha: '2026-01-02' };
    await expect(
      service.abrirTurno('p1', 'u1', 'pdr', dto as never),
    ).rejects.toThrow(/Solo administración/);
    await expect(
      service.abrirTurno('p1', 'u1', 'gerencia', dto as never),
    ).rejects.toThrow(/motivo/);
    await service.abrirTurno('p1', 'u1', 'gerencia', {
      ...dto,
      motivo: 'Hoja tardía',
    });
    expect(prisma.turno.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        corregidoPorId: 'u1',
        motivoCorreccion: 'Hoja tardía',
      }),
    });
  });

  it('no duplica la jornada del mismo día y horario', async () => {
    const { service, prisma } = setup();
    prisma.turnoConfig.findFirst.mockResolvedValue({ id: 'cfg', ...DIA });
    prisma.turno.findUnique.mockResolvedValue({ id: 'existe' });
    await expect(
      service.abrirTurno('p1', 'u1', 'pdr', {
        turnoConfigId: 'cfg',
        fecha: hoyIso(),
      }),
    ).rejects.toThrow(/Ya existe/);
  });
});

describe('AsistenciasService — evidencia', () => {
  it('subirFoto guarda en storage y limpia la omisión', async () => {
    const { service, prisma, storage } = setup();
    prisma.turno.findFirst.mockResolvedValue({ id: 't1' });
    await service.subirFoto('p1', 't1', {
      buffer: Buffer.from('x'),
      originalname: 'a.jpg',
      mimetype: 'image/jpeg',
    } as never);
    expect(storage.save).toHaveBeenCalledWith(
      expect.objectContaining({ folder: 'asistencias' }),
    );
    expect(prisma.turno.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: {
        fotoUrl: '/uploads/asistencias/foto.jpg',
        fotoOmitida: false,
        motivoFotoOmitida: null,
      },
    });
  });

  it('subirFoto falla si la jornada no es de la obra', async () => {
    const { service } = setup();
    await expect(
      service.subirFoto('p1', 't1', {} as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('omitirFoto exige jornada abierta', async () => {
    const { service, prisma } = setup();
    prisma.turno.findFirst.mockResolvedValueOnce(
      turnoAbierto({ estado: 'cerrado' }),
    );
    await expect(
      service.omitirFoto('p1', 't1', { motivo: 'sin señal' }),
    ).rejects.toThrow('El turno ya está cerrado');
    prisma.turno.findFirst.mockResolvedValueOnce(turnoAbierto());
    await service.omitirFoto('p1', 't1', { motivo: 'sin señal' });
    expect(prisma.turno.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { fotoOmitida: true, motivoFotoOmitida: 'sin señal' },
    });
  });
});

describe('AsistenciasService.registrarAsistencias', () => {
  it('exige evidencia resuelta antes de marcar', async () => {
    const { service, prisma } = setup();
    prisma.turno.findFirst.mockResolvedValue(turnoAbierto({ fotoUrl: null }));
    await expect(
      service.registrarAsistencias('p1', 't1', { asistencias: [] }),
    ).rejects.toThrow(/foto de evidencia/);
  });

  it('rechaza obreros no asignados', async () => {
    const { service, prisma } = setup();
    prisma.turno.findFirst.mockResolvedValue(turnoAbierto());
    prisma.proyectoTrabajador.findMany.mockResolvedValue([obrero('a')]);
    await expect(
      service.registrarAsistencias('p1', 't1', {
        asistencias: [{ trabajadorId: 'z', estado: 'presente' }],
      } as never),
    ).rejects.toThrow(/no asignado/);
  });

  it('hace upsert por obrero y devuelve el detalle', async () => {
    const { service, prisma } = setup();
    prisma.turno.findFirst.mockResolvedValue({
      ...turnoAbierto(),
      asistencias: [],
    });
    prisma.proyectoTrabajador.findMany.mockResolvedValue([
      obrero('a'),
      obrero('b'),
    ]);
    await service.registrarAsistencias('p1', 't1', {
      asistencias: [
        { trabajadorId: 'a', estado: 'presente' },
        { trabajadorId: 'b', estado: 'tardio', horaLlegadaReal: '08:30' },
      ],
    } as never);
    expect(prisma.asistencia.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

describe('AsistenciasService — cálculo de horas al cerrar', () => {
  function cierre(asistencias: object[], cfg = DIA, extraTurno: object = {}) {
    const ctx = setup();
    ctx.prisma.turno.findFirst.mockResolvedValue({
      ...turnoAbierto(extraTurno),
      asistencias: [],
    });
    ctx.prisma.turnoConfig.findUnique.mockResolvedValue(cfg);
    ctx.prisma.proyectoTrabajador.findMany.mockResolvedValue(
      asistencias.map((a: any) => obrero(a.trabajadorId)),
    );
    ctx.prisma.asistencia.findMany.mockResolvedValue(
      asistencias.map((a: any, i) => ({
        id: `as${i}`,
        trabajador: { nombre: a.trabajadorId },
        horaLlegadaReal: null,
        horaSalidaReal: null,
        salidaTempranaHora: null,
        ...a,
      })),
    );
    return ctx;
  }
  const datos = (prisma: PrismaMock) =>
    prisma.asistencia.update.mock.calls.map((c: any) => c[0].data);

  it('jornada completa cerrada a la hora: 9 horas normales, sin extra', async () => {
    const { service, prisma } = cierre(
      [{ trabajadorId: 'a', estado: 'presente' }],
      DIA,
      { horaCierreReal: lima(FECHA, '17:00') },
    );
    await service.cerrarTurno('p1', 't1', 'u1', {});
    expect(datos(prisma)[0]).toEqual({
      horasNormales: 9,
      horasExtra: 0,
      pagarExtra: false,
    });
  });

  it('el excedente dentro de la tolerancia suma como hora normal', async () => {
    const { service, prisma } = cierre(
      [{ trabajadorId: 'a', estado: 'presente' }],
      DIA,
      { horaCierreReal: lima(FECHA, '17:30') },
    );
    await service.cerrarTurno('p1', 't1', 'u1', {});
    expect(datos(prisma)[0]).toEqual(
      expect.objectContaining({ horasNormales: 9.5, horasExtra: 0 }),
    );
  });

  it('pasada la tolerancia exige decidir el pago de extras', async () => {
    const { service, prisma } = cierre(
      [{ trabajadorId: 'a', estado: 'presente' }],
      DIA,
      { horaCierreReal: lima(FECHA, '19:00') },
    );
    await expect(service.cerrarTurno('p1', 't1', 'u1', {})).rejects.toThrow(
      /horas extra/,
    );
    await service.cerrarTurno('p1', 't1', 'u1', { pagarExtra: true });
    expect(datos(prisma)[0]).toEqual({
      horasNormales: 9,
      horasExtra: 2,
      pagarExtra: true,
    });
  });

  it('tardanza descuenta desde la llegada; falta no suma horas', async () => {
    const { service, prisma } = cierre(
      [
        { trabajadorId: 'a', estado: 'tardio', horaLlegadaReal: '10:00' },
        { trabajadorId: 'b', estado: 'falta' },
      ],
      DIA,
      { horaCierreReal: lima(FECHA, '17:00') },
    );
    await service.cerrarTurno('p1', 't1', 'u1', {});
    expect(datos(prisma)).toEqual([
      expect.objectContaining({ horasNormales: 7, horasExtra: 0 }),
      expect.objectContaining({ horasNormales: 0, horasExtra: 0 }),
    ]);
  });

  it('salida temprana corta las horas en esa hora', async () => {
    const { service, prisma } = cierre(
      [{ trabajadorId: 'a', estado: 'presente', salidaTempranaHora: '12:00' }],
      DIA,
      { horaCierreReal: lima(FECHA, '17:00') },
    );
    await service.cerrarTurno('p1', 't1', 'u1', {});
    expect(datos(prisma)[0]).toEqual(
      expect.objectContaining({ horasNormales: 4, horasExtra: 0 }),
    );
  });

  it('salida registrada tarde cuenta como extra si pasa la tolerancia', async () => {
    const { service, prisma } = cierre(
      [{ trabajadorId: 'a', estado: 'presente', horaSalidaReal: '20:00' }],
      DIA,
      { horaCierreReal: lima(FECHA, '21:00') },
    );
    await service.cerrarTurno('p1', 't1', 'u1', { pagarExtra: false });
    expect(datos(prisma)[0]).toEqual({
      horasNormales: 9,
      horasExtra: 3,
      pagarExtra: false,
    });
  });

  it('tardanza con salida después del fin no paga dos veces el tramo extra', async () => {
    const { service, prisma } = cierre(
      [
        {
          trabajadorId: 'a',
          estado: 'tardio',
          horaLlegadaReal: '09:00',
          horaSalidaReal: '19:30',
        },
      ],
      DIA,
      { horaCierreReal: lima(FECHA, '20:00') },
    );
    await service.cerrarTurno('p1', 't1', 'u1', { pagarExtra: true });
    expect(datos(prisma)[0]).toEqual({
      horasNormales: 8,
      horasExtra: 2.5,
      pagarExtra: true,
    });
  });

  it('turno de noche: llegada después de medianoche cuenta del día siguiente', async () => {
    const { service, prisma } = cierre(
      [{ trabajadorId: 'a', estado: 'tardio', horaLlegadaReal: '01:00' }],
      NOCHE,
      { horaCierreReal: lima(FECHA, '06:00', 1) },
    );
    await service.cerrarTurno('p1', 't1', 'u1', {});
    expect(datos(prisma)[0]).toEqual(
      expect.objectContaining({ horasNormales: 5, horasExtra: 0 }),
    );
  });

  it('no deja cerrar si falta marcar a algún obrero asignado', async () => {
    const { service, prisma } = cierre([
      { trabajadorId: 'a', estado: 'presente' },
    ]);
    prisma.proyectoTrabajador.findMany.mockResolvedValue([
      obrero('a'),
      obrero('b', 'Beto'),
    ]);
    await expect(service.cerrarTurno('p1', 't1', 'u1', {})).rejects.toThrow(
      'Falta registrar la asistencia de: Beto',
    );
  });

  it('falla si el horario de la jornada ya no existe', async () => {
    const { service, prisma } = cierre([]);
    prisma.turnoConfig.findUnique.mockResolvedValue(null);
    await expect(service.cerrarTurno('p1', 't1', 'u1', {})).rejects.toThrow(
      /turno de horario configurado/,
    );
  });

  it('previsualizarCierre lista quién genera extras', async () => {
    const { service } = cierre(
      [
        { trabajadorId: 'a', estado: 'presente', horaSalidaReal: '19:00' },
        { trabajadorId: 'b', estado: 'presente', horaSalidaReal: '17:00' },
      ],
      DIA,
      { horaCierreReal: lima(FECHA, '19:00') },
    );
    const preview = await service.previsualizarCierre('p1', 't1');
    expect(preview).toEqual({
      hayExcedente: true,
      trabajadoresAfectados: [
        { trabajadorId: 'a', nombre: 'a', horasExtra: 2 },
      ],
      totalHorasExtra: 2,
    });
  });
});

describe('AsistenciasService — cierre automático', () => {
  it('el límite es la hora fin más el tope del horario', () => {
    const { service } = setup();
    expect(service.limiteCierreAutomatico(FECHA, DIA)).toEqual(
      lima(FECHA, '21:00'),
    );
    expect(
      service.limiteCierreAutomatico(FECHA, { ...DIA, topeCierreHoras: 2 }),
    ).toEqual(lima(FECHA, '19:00'));
    expect(
      service.limiteCierreAutomatico(FECHA, {
        ...NOCHE,
        topeCierreHoras: null,
      }),
    ).toEqual(lima(FECHA, '10:00', 1));
  });

  it('no toca jornadas cerradas ni las que aún no vencen', async () => {
    const { service, prisma } = setup();
    expect(await service.cerrarAutomaticamente('t1')).toBeNull();
    const manana = new Date(Date.now() + 86_400_000);
    prisma.turno.findUnique.mockResolvedValue({
      ...turnoAbierto({ fecha: manana }),
      turnoConfig: DIA,
      asistencias: [],
    });
    expect(await service.cerrarAutomaticamente('t1')).toBeNull();
  });

  it('cierra la jornada vencida hasta el límite y la marca para revisión', async () => {
    const { service, prisma } = setup();
    prisma.turno.findUnique.mockResolvedValue({
      ...turnoAbierto(),
      turnoConfig: DIA,
      asistencias: [
        {
          id: 'as1',
          estado: 'presente',
          horaLlegadaReal: null,
          horaSalidaReal: null,
          salidaTempranaHora: null,
        },
        {
          id: 'as2',
          estado: 'presente',
          horaLlegadaReal: null,
          horaSalidaReal: '17:00',
          salidaTempranaHora: null,
        },
      ],
    });
    const r = await service.cerrarAutomaticamente('t1');
    expect(r).toEqual({
      turnoId: 't1',
      proyectoId: 'p1',
      fecha: FECHA,
      conHorasExtra: true,
    });
    expect(
      prisma.asistencia.update.mock.calls.map((c: any) => c[0].data),
    ).toEqual([
      { horasNormales: 9, horasExtra: 4, pagarExtra: false },
      { horasNormales: 9, horasExtra: 0, pagarExtra: false },
    ]);
    expect(prisma.turno.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: expect.objectContaining({
        estado: 'cerrado',
        cierreAutomatico: true,
        cerradoPorId: null,
        horaCierreReal: lima(FECHA, '21:00'),
      }),
    });
  });
});

describe('AsistenciasService.registrarDesdeHoja', () => {
  const dto = (obreros: object[], extra: object = {}) =>
    ({ turnoConfigId: 'cfg', fecha: '2026-09-15', obreros, ...extra }) as never;
  function hoja(cfg: object = DIA) {
    const ctx = setup();
    ctx.prisma.turnoConfig.findFirst.mockResolvedValue({ id: 'cfg', ...cfg });
    ctx.prisma.proyectoTrabajador.findMany.mockResolvedValue([
      obrero('a'),
      obrero('b'),
    ]);
    ctx.prisma.turno.create.mockResolvedValue({ id: 'nuevo' });
    return ctx;
  }

  it('crea la jornada cerrada con estado y horas por obrero', async () => {
    const { service, prisma } = hoja();
    const r = await service.registrarDesdeHoja(
      'p1',
      'u1',
      dto(
        [
          {
            trabajadorId: 'a',
            horaLlegadaReal: '08:05',
            horaSalidaReal: '17:00',
          },
          {
            trabajadorId: 'b',
            horaLlegadaReal: '09:00',
            horaSalidaReal: '19:30',
          },
        ],
        { pagarExtra: true },
      ),
    );
    expect(r).toEqual({ turnoId: 'nuevo' });
    const data = prisma.turno.create.mock.calls[0][0].data;
    expect(data).toEqual(
      expect.objectContaining({
        estado: 'cerrado',
        origen: 'hoja',
        fotoOmitida: true,
        horaAperturaReal: lima(FECHA, '08:00'),
      }),
    );
    expect(data.asistencias.create).toEqual([
      expect.objectContaining({
        trabajadorId: 'a',
        estado: 'presente',
        horasNormales: 9,
        horasExtra: 0,
        pagarExtra: false,
      }),
      expect.objectContaining({
        trabajadorId: 'b',
        estado: 'tardio',
        horasNormales: 8,
        horasExtra: 2.5,
        pagarExtra: true,
      }),
    ]);
  });

  it('en turno de noche una llegada de madrugada es tardanza', async () => {
    const { service, prisma } = hoja(NOCHE);
    await service.registrarDesdeHoja(
      'p1',
      'u1',
      dto([
        {
          trabajadorId: 'a',
          horaLlegadaReal: '00:30',
          horaSalidaReal: '06:00',
        },
      ]),
    );
    const data = prisma.turno.create.mock.calls[0][0].data;
    expect(data.asistencias.create[0].estado).toBe('tardio');
    expect(data.horaCierreReal).toEqual(lima(FECHA, '06:00', 1));
  });

  it('valida horario, fecha futura, duplicados y obreros', async () => {
    const { service, prisma } = hoja();
    prisma.turnoConfig.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.registrarDesdeHoja('p1', 'u1', dto([])),
    ).rejects.toThrow(/horario indicado/);
    await expect(
      service.registrarDesdeHoja('p1', 'u1', {
        ...(dto([]) as object),
        fecha: '2999-01-01',
      } as never),
    ).rejects.toThrow(/fecha futura/);
    prisma.turno.findUnique.mockResolvedValueOnce({ id: 'existe' });
    await expect(
      service.registrarDesdeHoja('p1', 'u1', dto([])),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.registrarDesdeHoja(
        'p1',
        'u1',
        dto([
          {
            trabajadorId: 'z',
            horaLlegadaReal: '08:00',
            horaSalidaReal: '17:00',
          },
        ]),
      ),
    ).rejects.toThrow(/no están asignados/);
    const repetido = {
      trabajadorId: 'a',
      horaLlegadaReal: '08:00',
      horaSalidaReal: '17:00',
    };
    await expect(
      service.registrarDesdeHoja('p1', 'u1', dto([repetido, repetido])),
    ).rejects.toThrow(/repetido/);
  });
});

describe('AsistenciasService — correcciones', () => {
  it('revisarCierre solo aplica a cierres automáticos sin revisar', async () => {
    const { service, prisma } = setup();
    await expect(
      service.revisarCierre('p1', 't1', 'u1', { pagarExtra: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
    prisma.turno.findFirst.mockResolvedValueOnce(
      turnoAbierto({ estado: 'cerrado', cierreAutomatico: false }),
    );
    await expect(
      service.revisarCierre('p1', 't1', 'u1', { pagarExtra: true }),
    ).rejects.toThrow(/no se cerró automáticamente/);
    prisma.turno.findFirst.mockResolvedValueOnce(
      turnoAbierto({
        estado: 'cerrado',
        cierreAutomatico: true,
        cierreRevisadoEn: new Date(),
      }),
    );
    await expect(
      service.revisarCierre('p1', 't1', 'u1', { pagarExtra: true }),
    ).rejects.toThrow(/ya fue revisado/);
    prisma.turno.findFirst
      .mockResolvedValueOnce(
        turnoAbierto({
          estado: 'cerrado',
          cierreAutomatico: true,
          cierreRevisadoEn: null,
        }),
      )
      .mockResolvedValueOnce({ ...turnoAbierto(), asistencias: [] });
    await service.revisarCierre('p1', 't1', 'u1', { pagarExtra: true });
    expect(prisma.asistencia.updateMany).toHaveBeenCalledWith({
      where: { turnoId: 't1', horasExtra: { gt: 0 } },
      data: { pagarExtra: true },
    });
  });

  it('reabrirTurno exige jornada cerrada y registra la corrección', async () => {
    const { service, prisma } = setup();
    await expect(
      service.reabrirTurno('p1', 't1', 'u1', { motivo: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    prisma.turno.findFirst.mockResolvedValueOnce(turnoAbierto());
    await expect(
      service.reabrirTurno('p1', 't1', 'u1', { motivo: 'x' }),
    ).rejects.toThrow('El turno no está cerrado');
    prisma.turno.findFirst.mockResolvedValueOnce(
      turnoAbierto({ estado: 'cerrado' }),
    );
    await service.reabrirTurno('p1', 't1', 'u1', {
      motivo: 'Error de marcación',
    });
    expect(prisma.turno.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: expect.objectContaining({
        estado: 'abierto',
        corregidoPorId: 'u1',
        motivoCorreccion: 'Error de marcación',
      }),
    });
  });

  it('editarHorario valida estado y orden de horas', async () => {
    const { service, prisma } = setup();
    const dto = {
      fecha: '2026-09-15',
      horaAperturaReal: '2026-09-15T13:00:00Z',
      horaCierreReal: '2026-09-15T22:00:00Z',
    };
    await expect(service.editarHorario('p1', 't1', dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    prisma.turno.findFirst.mockResolvedValueOnce(
      turnoAbierto({ estado: 'cerrado' }),
    );
    await expect(service.editarHorario('p1', 't1', dto)).rejects.toThrow(
      /jornada abierta/,
    );
    prisma.turno.findFirst.mockResolvedValueOnce(turnoAbierto());
    await expect(
      service.editarHorario('p1', 't1', {
        ...dto,
        horaCierreReal: dto.horaAperturaReal,
      }),
    ).rejects.toThrow(/posterior/);
    prisma.turno.findFirst.mockResolvedValueOnce(turnoAbierto());
    await service.editarHorario('p1', 't1', dto);
    expect(prisma.turno.update).toHaveBeenCalled();
  });
});
