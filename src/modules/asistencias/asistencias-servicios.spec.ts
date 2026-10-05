import { NotFoundException } from '@nestjs/common';
import { ConsolidadoAsistenciaService } from './consolidado-asistencia.service.js';
import { JornadaGlobalService } from './jornada-global.service.js';
import { RegistroVisitaService } from './registro-visita.service.js';
import { VisitaTerceroService } from './visita-tercero.service.js';
import { ConsolidadoAccesoService } from './consolidado-acceso.service.js';
import { TurnoConfigsService } from './turno-configs.service.js';
import { CierreAutomaticoService } from './cierre-automatico.service.js';
import { Prisma } from '../../../prisma/generated/prisma/client.js';
import { hoyLima } from '../../shared/date/fecha.util.js';
import { AppEvents } from '../../shared/events/events.js';
import { fn, prismaMock } from '../../testing/mocks.js';

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('ConsolidadoAsistenciaService', () => {
  function setup() {
    const prisma = prismaMock();
    const events = { emit: fn() };
    return {
      prisma,
      events,
      service: new ConsolidadoAsistenciaService(
        prisma as never,
        events as never,
      ),
    };
  }
  const asistencia = (
    trabajadorId: string,
    nombre: string,
    normales: number,
    extra: number,
    pagarExtra = false,
    precioHora: string | null = '10',
  ) => ({
    trabajadorId,
    horasNormales: normales,
    horasExtra: extra,
    pagarExtra,
    estado: 'presente',
    trabajador: { nombre, perfilObrero: precioHora ? { precioHora } : null },
  });

  it('consolida por jornada y por trabajador', async () => {
    const { service, prisma } = setup();
    prisma.turno.findMany.mockResolvedValue([
      {
        id: 't1',
        fecha: d('2026-09-01'),
        estado: 'cerrado',
        asistencias: [
          asistencia('a', 'Ana', 8, 1),
          asistencia('b', 'Beto', 8, 0),
        ],
      },
      {
        id: 't2',
        fecha: d('2026-09-02'),
        estado: 'cerrado',
        asistencias: [asistencia('a', 'Ana', 9, 0)],
      },
    ]);
    const r = await service.consolidadoObra('p1', '2026-09-01', '2026-09-02');
    expect(r.totales).toEqual({ horasNormales: 25, horasExtra: 1 });
    expect(r.turnos[0]).toEqual(
      expect.objectContaining({ turnoId: 't1', horasNormales: 16, obreros: 2 }),
    );
    expect(r.porTrabajador.find((t) => t.trabajadorId === 'a')).toEqual({
      trabajadorId: 'a',
      nombre: 'Ana',
      horasNormales: 17,
      horasExtra: 1,
      turnos: 2,
    });
  });

  it('consolida un trabajador por obra, con o sin rango', async () => {
    const { service, prisma } = setup();
    const proyecto = { id: 'p1', nombre: 'Obra 1' };
    prisma.asistencia.findMany.mockResolvedValue([
      {
        estado: 'presente',
        horasNormales: 8,
        horasExtra: 2,
        turno: { fecha: d('2026-09-01'), proyecto },
      },
      {
        estado: 'tardio',
        horasNormales: 6,
        horasExtra: 0,
        turno: { fecha: d('2026-09-02'), proyecto },
      },
    ]);
    const r = await service.consolidadoTrabajador(
      'a',
      '2026-09-01',
      '2026-09-30',
    );
    expect(prisma.asistencia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          trabajadorId: 'a',
          turno: { fecha: { gte: d('2026-09-01'), lte: d('2026-09-30') } },
        },
      }),
    );
    expect(r.totales).toEqual({ horasNormales: 14, horasExtra: 2 });
    expect(r.porObra[0].turnos).toHaveLength(2);
    await service.consolidadoTrabajador('a');
    expect(prisma.asistencia.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { trabajadorId: 'a' } }),
    );
  });

  it('la vista previa paga solo extras aprobadas y marca a quien no tiene tarifa', async () => {
    const { service, prisma } = setup();
    prisma.asistencia.findMany.mockResolvedValue([
      asistencia('a', 'Ana', 8, 2, true),
      asistencia('a', 'Ana', 8, 1, false),
      asistencia('b', 'Beto', 8, 0, false, null),
    ]);
    const r = await service.planillaPreview(
      'p1',
      '2026-09-01',
      '2026-09-15',
      15,
    );
    const ana = r.trabajadores.find((t) => t.trabajadorId === 'a')!;
    expect(ana).toEqual(
      expect.objectContaining({
        horasNormales: 16,
        horasExtraPagable: 2,
        montoNormal: 160,
        montoExtra: 30,
        total: 190,
        sinTarifa: false,
      }),
    );
    expect(r.trabajadores.find((t) => t.trabajadorId === 'b')).toEqual(
      expect.objectContaining({ total: 0, sinTarifa: true }),
    );
    expect(r.totalGeneral).toBe(190);
  });

  it('genera la planilla, avisa y no duplica el periodo', async () => {
    const { service, prisma, events } = setup();
    await expect(
      service.generarPlanilla('p1', 'u1', '2026-09-01', '2026-09-15', 15),
    ).rejects.toBeInstanceOf(NotFoundException);
    prisma.proyecto.findUnique.mockResolvedValue({
      id: 'p1',
      nombre: 'Obra 1',
    });
    prisma.planilla.findUnique.mockResolvedValueOnce({ id: 'ya' });
    await expect(
      service.generarPlanilla('p1', 'u1', '2026-09-01', '2026-09-15', 15),
    ).rejects.toThrow(/Ya existe/);
    await expect(
      service.generarPlanilla('p1', 'u1', '2026-09-01', '2026-09-15', 15),
    ).rejects.toThrow(/No hay turnos cerrados/);
    prisma.asistencia.findMany.mockResolvedValue([
      asistencia('a', 'Ana', 8, 0),
    ]);
    await service.generarPlanilla('p1', 'u1', '2026-09-01', '2026-09-15', 15);
    expect(prisma.planilla.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalGeneral: 80,
          generadaPorId: 'u1',
        }),
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      AppEvents.PLANILLA_GENERADA,
      expect.objectContaining({ proyectoId: 'p1', totalGeneral: '80.00' }),
    );
  });

  it('lista y obtiene planillas', async () => {
    const { service, prisma } = setup();
    await service.listarPlanillas('p1');
    await service.listarPlanillasGlobal({
      proyectoId: 'p1',
      desde: '2026-09-01',
      hasta: '2026-09-30',
    });
    expect(prisma.planilla.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          proyectoId: 'p1',
          periodoInicio: { gte: d('2026-09-01') },
          periodoFin: { lte: d('2026-09-30') },
        },
      }),
    );
    await service.listarPlanillasGlobal({});
    await expect(service.obtenerPlanilla('p1', 'x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    prisma.planilla.findFirst.mockResolvedValue({ id: 'pl' });
    expect(await service.obtenerPlanilla('p1', 'pl')).toEqual({ id: 'pl' });
  });
});

describe('JornadaGlobalService', () => {
  const setup = () => {
    const prisma = prismaMock();
    return { prisma, service: new JornadaGlobalService(prisma as never) };
  };
  const proyecto = {
    id: 'p1',
    nombre: 'Obra',
    codigo: '26-001',
    turnoConfigs: [{ id: 'c1' }],
    turnos: [
      {
        id: 't1',
        estado: 'abierto',
        turnoConfig: { nombre: 'Mañana' },
        _count: { asistencias: 3 },
      },
    ],
  };

  it('obrasHoy acota al prevencionista y arma tarjetas', async () => {
    const { service, prisma } = setup();
    prisma.trabajador.findUnique.mockResolvedValue({ id: 'trab-1' });
    prisma.proyecto.findMany.mockResolvedValue([proyecto]);
    const r = await service.obrasHoy('u1', 'pdr');
    expect(prisma.proyecto.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ prevencionistaId: 'trab-1' }),
      }),
    );
    expect(r.obras[0]).toEqual(
      expect.objectContaining({
        puedeOperar: true,
        turnos: [
          { id: 't1', estado: 'abierto', horario: 'Mañana', obreros: 3 },
        ],
      }),
    );
  });

  it('obrasHoy sin trabajador vinculado no muestra obras ajenas; gerencia ve todo', async () => {
    const { service, prisma } = setup();
    await service.obrasHoy('u1', 'pdr');
    expect(prisma.proyecto.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ prevencionistaId: '__none__' }),
      }),
    );
    prisma.proyecto.findMany.mockResolvedValue([proyecto]);
    const r = await service.obrasHoy('u2', 'logistica');
    expect(r.obras[0].puedeOperar).toBe(false);
    expect(
      (await service.obrasHoy('u3', 'gerencia')).obras[0].puedeOperar,
    ).toBe(true);
  });

  it('pendientes cuenta jornadas sin cerrar y por revisar', async () => {
    const { service, prisma } = setup();
    prisma.turno.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    prisma.turno.findFirst.mockResolvedValue({ fecha: d('2026-09-01') });
    expect(await service.pendientes()).toEqual({
      sinCerrar: 2,
      masAntigua: '2026-09-01',
      porRevisar: 1,
    });
  });

  it('listarJornadas aplica filtros por estado y suma horas', async () => {
    const { service, prisma } = setup();
    prisma.turno.findMany.mockResolvedValue([
      {
        id: 't1',
        fecha: d('2026-09-01'),
        estado: 'cerrado',
        origen: 'campo',
        cierreAutomatico: false,
        cierreRevisadoEn: null,
        proyecto: { id: 'p1', nombre: 'Obra', codigo: null },
        turnoConfig: { nombre: 'Mañana' },
        asistencias: [
          { horasNormales: 8, horasExtra: 1 },
          { horasNormales: 8, horasExtra: 0 },
        ],
      },
    ]);
    const [j] = await service.listarJornadas({
      estado: 'cerrada',
      desde: '2026-09-01',
      hasta: '2026-09-30',
    });
    expect(j).toEqual(
      expect.objectContaining({
        obreros: 2,
        horasNormales: 16,
        horasExtra: 1,
        cierreRevisado: false,
      }),
    );
    await service.listarJornadas({ estado: 'sin_cerrar' });
    const ayer = new Date(hoyLima().getTime() - 86_400_000);
    expect(prisma.turno.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          estado: 'abierto',
          fecha: { lte: ayer },
        }),
      }),
    );
    await service.listarJornadas({ estado: 'por_revisar', proyectoId: 'p1' });
    expect(prisma.turno.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          proyectoId: 'p1',
          cierreAutomatico: true,
          cierreRevisadoEn: null,
        },
      }),
    );
  });

  it('obtenerJornada oculta la tarifa a Jefe SIG', async () => {
    const { service, prisma } = setup();
    await expect(
      service.obtenerJornada('x', 'gerencia'),
    ).rejects.toBeInstanceOf(NotFoundException);
    prisma.turno.findUnique.mockResolvedValue({
      id: 't1',
      fecha: d('2026-09-01'),
      estado: 'cerrado',
      proyecto: { id: 'p1', nombre: 'Obra', codigo: null },
      turnoConfig: { nombre: 'Mañana', topeCierreHoras: 4 },
      asistencias: [
        {
          trabajadorId: 'a',
          horasNormales: 8,
          horasExtra: 0,
          trabajador: {
            nombre: 'Ana',
            dni: '1',
            perfilObrero: { precioHora: '12.5' },
          },
        },
      ],
    });
    const gerencia = await service.obtenerJornada('t1', 'gerencia');
    expect(gerencia.trabajadores[0].precioHora).toBe(12.5);
    expect(gerencia.topeCierreHoras).toBe(4);
    const sig = await service.obtenerJornada('t1', 'jefe_sig');
    expect(sig.trabajadores[0].precioHora).toBeNull();
  });
});

describe('RegistroVisitaService', () => {
  const setup = () => {
    const prisma = prismaMock();
    prisma.proyecto.findUnique.mockResolvedValue({ id: 'p1' });
    return { prisma, service: new RegistroVisitaService(prisma as never) };
  };

  it('lista por fecha o por hoy', async () => {
    const { service, prisma } = setup();
    await service.listar('p1', '2026-09-01');
    expect(prisma.registroVisita.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { proyectoId: 'p1', fecha: d('2026-09-01') },
      }),
    );
    await service.listar('p1');
    expect(prisma.registroVisita.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { proyectoId: 'p1', fecha: hoyLima() },
      }),
    );
  });

  it('staff de obra debe estar asignado y no ser operario', async () => {
    const { service, prisma } = setup();
    await expect(
      service.registrarEntrada('p1', 'u1', { tipo: 'staff' } as never),
    ).rejects.toThrow(/requiere trabajadorId/);
    await expect(
      service.registrarEntrada('p1', 'u1', {
        tipo: 'staff',
        trabajadorId: 'a',
      } as never),
    ).rejects.toThrow(/no está asignado/);
    prisma.proyectoTrabajador.findFirst.mockResolvedValueOnce({
      trabajador: { cargo: 'Operario' },
    });
    await expect(
      service.registrarEntrada('p1', 'u1', {
        tipo: 'staff',
        trabajadorId: 'a',
      } as never),
    ).rejects.toThrow(/operarios/);
    prisma.proyectoTrabajador.findFirst.mockResolvedValueOnce({
      trabajador: { cargo: 'Ingeniero residente' },
    });
    await service.registrarEntrada('p1', 'u1', {
      tipo: 'staff',
      trabajadorId: 'a',
    } as never);
    expect(prisma.registroVisita.create).toHaveBeenCalled();
  });

  it('staff de oficina requiere identificación y motivo; obra debe existir', async () => {
    const { service, prisma } = setup();
    await expect(
      service.registrarEntrada('p1', 'u1', { tipo: 'staff_oficina' } as never),
    ).rejects.toThrow(/requiere trabajadorId, userId o nombreLibre/);
    await expect(
      service.registrarEntrada('p1', 'u1', {
        tipo: 'staff_oficina',
        nombreLibre: 'Juan',
      } as never),
    ).rejects.toThrow(/motivo/);
    await service.registrarEntrada('p1', 'u1', {
      tipo: 'staff_oficina',
      nombreLibre: 'Juan',
      motivo: 'Inspección',
    } as never);
    expect(prisma.registroVisita.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        nombreLibre: 'Juan',
        registradoPorId: 'u1',
      }),
    });
    prisma.proyecto.findUnique.mockResolvedValue(null);
    await expect(
      service.registrarEntrada('p1', 'u1', { tipo: 'staff_oficina' } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('marca la salida una sola vez', async () => {
    const { service, prisma } = setup();
    await expect(service.marcarSalida('p1', 'r1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    prisma.registroVisita.findFirst.mockResolvedValueOnce({
      horaSalida: new Date(),
    });
    await expect(service.marcarSalida('p1', 'r1')).rejects.toThrow(
      /Ya se registró/,
    );
    prisma.registroVisita.findFirst.mockResolvedValueOnce({ horaSalida: null });
    await service.marcarSalida('p1', 'r1');
    expect(prisma.registroVisita.update).toHaveBeenCalled();
  });
});

describe('VisitaTerceroService', () => {
  it('registra empresa con visitantes y marca salida', async () => {
    const prisma = prismaMock();
    const service = new VisitaTerceroService(prisma as never);
    await service.listar('p1');
    await service.listar('p1', '2026-09-01');
    await expect(
      service.registrar('p1', 'u1', {
        empresaNombre: 'X',
        visitantes: [],
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    prisma.proyecto.findUnique.mockResolvedValue({ id: 'p1' });
    await service.registrar('p1', 'u1', {
      empresaNombre: 'Sedalib',
      motivo: 'Medición',
      visitantes: [{ nombre: 'Luis', dni: '123' }],
    });
    const data = prisma.visitaTercero.create.mock.calls[0][0].data;
    expect(data.visitantes.create[0]).toEqual(
      expect.objectContaining({ nombre: 'Luis', dni: '123' }),
    );
    await expect(
      service.marcarSalidaVisitante('p1', 'v1', 'x'),
    ).rejects.toBeInstanceOf(NotFoundException);
    prisma.visitanteTercero.findFirst.mockResolvedValueOnce({
      horaSalida: new Date(),
    });
    await expect(
      service.marcarSalidaVisitante('p1', 'v1', 'x'),
    ).rejects.toThrow(/Ya se registró/);
    prisma.visitanteTercero.findFirst.mockResolvedValueOnce({
      horaSalida: null,
    });
    await service.marcarSalidaVisitante('p1', 'v1', 'x');
    expect(prisma.visitanteTercero.update).toHaveBeenCalled();
  });
});

describe('ConsolidadoAccesoService', () => {
  it('une operarios presentes, staff y terceros, filtra por tipo y ordena por fecha', async () => {
    const prisma = prismaMock();
    const proyecto = { id: 'p1', nombre: 'Obra' };
    prisma.turno.findMany.mockResolvedValue([
      {
        fecha: d('2026-09-01'),
        horaAperturaReal: null,
        horaCierreReal: null,
        proyecto,
        asistencias: [
          { estado: 'presente', trabajador: { nombre: 'Ana', dni: '1' } },
          { estado: 'falta', trabajador: { nombre: 'Beto', dni: '2' } },
        ],
      },
    ]);
    prisma.registroVisita.findMany.mockResolvedValue([
      {
        tipo: 'staff_oficina',
        trabajador: null,
        user: null,
        nombreLibre: null,
        motivo: 'x',
        horaEntrada: null,
        horaSalida: null,
        fecha: d('2026-09-03'),
        proyecto,
      },
    ]);
    prisma.visitaTercero.findMany.mockResolvedValue([
      {
        empresaNombre: 'Sedalib',
        motivo: 'm',
        fecha: d('2026-09-02'),
        proyecto,
        visitantes: [
          { nombre: 'Luis', dni: '9', horaEntrada: null, horaSalida: null },
        ],
      },
    ]);
    const service = new ConsolidadoAccesoService(prisma as never);
    const todos = await service.consolidado({
      desde: '2026-09-01',
      hasta: '2026-09-30',
      proyectoId: 'p1',
    });
    expect(todos.map((i) => [i.tipo, i.nombre])).toEqual([
      ['staff_oficina', 'Sin identificar'],
      ['tercero', 'Luis'],
      ['operario', 'Ana'],
    ]);
    expect(await service.consolidado({ tipo: 'tercero' })).toHaveLength(1);
  });
});

describe('TurnoConfigsService', () => {
  const setup = () => {
    const prisma = prismaMock();
    prisma.proyecto.findUnique.mockResolvedValue({ id: 'p1' });
    return { prisma, service: new TurnoConfigsService(prisma as never) };
  };

  it('crea con valores por defecto y detecta turnos que cruzan medianoche', async () => {
    const { service, prisma } = setup();
    await service.create('p1', {
      nombre: 'Noche',
      horaInicio: '22:00',
      horaFin: '06:00',
    });
    expect(prisma.turnoConfig.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        cruzaMedianoche: true,
        toleranciaMinutos: 10,
        toleranciaSalidaMinutos: 60,
        topeCierreHoras: 4,
      }),
    });
  });

  it('traduce el nombre duplicado a un error legible', async () => {
    const { service, prisma } = setup();
    prisma.turnoConfig.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: '7',
      }),
    );
    await expect(
      service.create('p1', {
        nombre: 'Mañana',
        horaInicio: '07:00',
        horaFin: '15:00',
      }),
    ).rejects.toThrow('Ya existe un turno llamado "Mañana" en esta obra');
    prisma.turnoConfig.create.mockRejectedValue(new Error('otro'));
    await expect(
      service.create('p1', {
        nombre: 'X',
        horaInicio: '07:00',
        horaFin: '15:00',
      }),
    ).rejects.toThrow('otro');
  });

  it('actualiza recalculando medianoche solo si cambian las horas', async () => {
    const { service, prisma } = setup();
    prisma.turnoConfig.findFirst.mockResolvedValue({
      id: 'c1',
      nombre: 'Mañana',
      horaInicio: '07:00',
      horaFin: '15:00',
    });
    await service.update('p1', 'c1', { horaFin: '06:00', topeCierreHoras: 6 });
    expect(prisma.turnoConfig.update).toHaveBeenLastCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({
        cruzaMedianoche: true,
        topeCierreHoras: 6,
      }),
    });
    await service.update('p1', 'c1', { activo: false });
    expect(prisma.turnoConfig.update).toHaveBeenLastCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({
        cruzaMedianoche: undefined,
        activo: false,
      }),
    });
  });

  it('lista, obtiene y desactiva; valida obra y horario', async () => {
    const { service, prisma } = setup();
    await service.findAll('p1');
    await expect(service.findOne('p1', 'x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    prisma.turnoConfig.findFirst.mockResolvedValue({ id: 'c1' });
    await service.desactivar('p1', 'c1');
    expect(prisma.turnoConfig.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { activo: false },
    });
    prisma.proyecto.findUnique.mockResolvedValue(null);
    await expect(service.findAll('p9')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('CierreAutomaticoService', () => {
  function setup() {
    const prisma = prismaMock();
    const asistencias = { cerrarAutomaticamente: fn() };
    const notificaciones = { crearParaRoles: fn(), crearParaUsuarios: fn() };
    const service = new CierreAutomaticoService(
      prisma as never,
      asistencias as never,
      notificaciones as never,
    );
    return { prisma, asistencias, notificaciones, service };
  }

  it('cierra las vencidas y avisa a roles y al prevencionista', async () => {
    const { service, prisma, asistencias, notificaciones } = setup();
    prisma.turno.findMany.mockResolvedValue([
      { id: 't1' },
      { id: 't2' },
      { id: 't3' },
    ]);
    asistencias.cerrarAutomaticamente
      .mockResolvedValueOnce({
        turnoId: 't1',
        proyectoId: 'p1',
        fecha: d('2026-09-01'),
        conHorasExtra: true,
      })
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('boom'));
    prisma.proyecto.findUnique.mockResolvedValue({
      nombre: 'Obra',
      prevencionista: { userId: 'prev' },
    });
    await service.ejecutar();
    expect(notificaciones.crearParaRoles).toHaveBeenCalledTimes(1);
    const [, input] = notificaciones.crearParaRoles.mock.calls[0];
    expect(input.mensaje).toContain('01/09/2026 de Obra');
    expect(input.mensaje).toContain('horas extra');
    expect(notificaciones.crearParaUsuarios).toHaveBeenCalledWith(
      ['prev'],
      expect.anything(),
      { enviarEmail: false },
    );
  });

  it('no corre dos veces en paralelo y no avisa si la obra no existe', async () => {
    const { service, prisma, asistencias, notificaciones } = setup();
    let liberar!: (v: unknown) => void;
    prisma.turno.findMany.mockReturnValue(new Promise((r) => (liberar = r)));
    const primera = service.ejecutar();
    await service.ejecutar();
    liberar([{ id: 't1' }]);
    asistencias.cerrarAutomaticamente.mockResolvedValue({
      turnoId: 't1',
      proyectoId: 'p1',
      fecha: d('2026-09-01'),
      conHorasExtra: false,
    });
    await primera;
    expect(prisma.turno.findMany).toHaveBeenCalledTimes(1);
    expect(notificaciones.crearParaRoles).not.toHaveBeenCalled();
  });
});
