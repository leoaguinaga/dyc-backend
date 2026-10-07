import { DashboardService } from './dashboard.service.js';
import { hoyLima } from '../../shared/date/fecha.util.js';
import { prismaMock, type PrismaMock } from '../../testing/mocks.js';

const DIA = 86_400_000;
const hoy = hoyLima();
const enDias = (n: number) => new Date(hoy.getTime() + n * DIA);
const user = (role: string) =>
  ({ id: 'u1', name: 'Ana', email: 'a@x', role }) as never;

function setup() {
  const prisma: PrismaMock = prismaMock();
  return { prisma, service: new DashboardService(prisma as never) };
}

describe('DashboardService.inicio', () => {
  it('lista los requerimientos propios por corregir, completar o confirmar', async () => {
    const { service, prisma } = setup();
    prisma.requerimiento.findMany.mockResolvedValueOnce([
      {
        id: 'r1',
        codigo: 'RQ-1',
        nombre: 'Cemento',
        estado: 'observado',
        urgente: false,
        fechaEntregaRequerida: enDias(3),
        notaRevision: 'Falta cantidad',
      },
      {
        id: 'r2',
        codigo: 'RQ-2',
        nombre: 'Fierro',
        estado: 'pendiente_conformidad',
        urgente: false,
        fechaEntregaRequerida: null,
        notaRevision: null,
      },
      {
        id: 'r3',
        codigo: 'RQ-3',
        nombre: 'Clavos',
        estado: 'borrador',
        urgente: true,
        fechaEntregaRequerida: null,
        notaRevision: null,
      },
    ]);
    prisma.solicitudCotizacion.findMany.mockResolvedValueOnce([
      {
        id: 's1',
        codigo: 'SC-1',
        estado: 'aprobada_solicitante',
        actualizadoEn: hoy,
        requerimiento: { codigo: 'RQ-1', nombre: 'Cemento' },
      },
      {
        id: 's2',
        codigo: 'SC-2',
        estado: 'enviada',
        actualizadoEn: hoy,
        requerimiento: null,
      },
    ]);
    const r = await service.inicio(user('supervisor'));
    expect(r.tareas.map((t) => t.titulo)).toEqual([
      'Corrige RQ-1',
      'Completa RQ-3',
      'Confirma la recepción de RQ-2',
    ]);
    expect(r.tareas[0]).toEqual(
      expect.objectContaining({
        contexto: 'Falta cantidad',
        bloqueada: true,
        proxima: true,
      }),
    );
    expect(r.seguimiento.map((t) => t.titulo)).toEqual([
      'SC-1 está aprobada solicitante',
      'SC-2 está enviada',
    ]);
    expect(r.resumen).toEqual({ pendientes: 3, bloqueos: 1, proximos: 1 });
    expect(r.usuario.etiquetaRol).toBe('Supervisor');
  });

  it('suma aprobaciones de requerimientos para las áreas técnicas', async () => {
    const { service, prisma } = setup();
    prisma.requerimiento.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'r9',
          codigo: 'RQ-9',
          nombre: 'EPP',
          urgente: true,
          fechaEntregaRequerida: null,
          proyecto: { codigo: null, nombre: 'Obra' },
        },
      ]);
    prisma.ordenCompra.findMany.mockResolvedValueOnce([
      {
        id: 'o1',
        numero: 'OC-1',
        nombre: null,
        estadoAprobacion: 'observada',
        actualizadoEn: hoy,
        compraSimple: { id: 'cs1', codigo: 'CS-1', nombre: 'Guantes' },
      },
      {
        id: 'o2',
        numero: 'OC-2',
        nombre: 'Lentes',
        estadoAprobacion: 'pendiente',
        actualizadoEn: hoy,
        compraSimple: null,
      },
    ]);
    const r = await service.inicio(user('jefe_sig'));
    expect(r.tareas.map((t) => [t.titulo, t.prioridad])).toEqual([
      ['Revisa RQ-9', 'critica'],
      ['Destraba OC-1', 'alta'],
    ]);
    expect(r.tareas[0].contexto).toBe('RQ-9 · Obra');
  });

  it('logística ve cotizaciones, entregas vencidas y sus acciones rápidas', async () => {
    const { service, prisma } = setup();
    prisma.solicitudCotizacion.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 's1',
          codigo: 'SC-1',
          estado: 'seleccionada',
          actualizadoEn: hoy,
          requerimiento: { nombre: 'Cemento' },
          proyecto: { codigo: '26-001', nombre: 'Obra' },
        },
        {
          id: 's2',
          codigo: 'SC-2',
          estado: 'enviada',
          actualizadoEn: hoy,
          requerimiento: null,
          proyecto: null,
        },
      ]);
    prisma.ordenCompra.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'o1',
          numero: 'OC-7',
          fechaEntrega: enDias(-2),
          concepto: null,
          solicitud: { requerimiento: { nombre: 'Arena' } },
          proyecto: { codigo: null, nombre: 'Obra' },
        },
      ]);
    const r = await service.inicio(user('logistica'));
    expect(r.tareas[0]).toEqual(
      expect.objectContaining({
        titulo: 'Entrega vencida: OC-7',
        concepto: 'Arena',
        bloqueada: true,
      }),
    );
    expect(r.tareas.find((t) => t.id === 'cotizacion-s2')).toEqual(
      expect.objectContaining({
        contexto: 'Estado: enviada',
        requiereAccion: false,
      }),
    );
    expect(r.accionesRapidas.map((a) => a.id)).toEqual([
      'cotizaciones',
      'ordenes',
      'requerimiento',
      'pagos',
    ]);
  });

  it('finanzas ve pagos, cobros y planillas pendientes', async () => {
    const { service, prisma } = setup();
    prisma.pago.findMany.mockResolvedValueOnce([
      {
        id: 'p1',
        concepto: null,
        beneficiarioNombre: 'Juan',
        monto: '1500',
        fechaProgramada: enDias(-1),
        proyecto: { codigo: '26-001', nombre: 'Obra' },
      },
      {
        id: 'p2',
        concepto: 'Alquiler',
        beneficiarioNombre: null,
        monto: '800',
        fechaProgramada: enDias(3),
        proyecto: null,
      },
    ]);
    prisma.cobro.findMany.mockResolvedValueOnce([
      {
        id: 'c1',
        monto: '5000',
        fechaProgramada: enDias(-5),
        proyecto: { codigo: null, nombre: 'Obra' },
      },
      {
        id: 'c2',
        monto: '1000',
        fechaProgramada: enDias(2),
        proyecto: { codigo: '26-002', nombre: 'Otra' },
      },
    ]);
    prisma.planillaStaff.findMany.mockResolvedValueOnce([
      { id: 'pl1', periodo: '2026-09', totalGeneral: '9000' },
    ]);
    const r = await service.inicio(user('gerencia'));
    const titulos = r.tareas.map((t) => t.titulo);
    expect(titulos).toEqual(
      expect.arrayContaining([
        'Pago vencido: Juan',
        'Programa pago: Alquiler',
        'Cobro vencido',
        'Cobro próximo',
        'Revisa planilla staff 2026-09',
      ]),
    );
    expect(r.accionesRapidas.map((a) => a.id)).toEqual([
      'pago',
      'cobros',
      'planilla',
      'requerimiento',
    ]);
  });

  it('el prevencionista ve sus jornadas abiertas; admin_ti no ve registros propios', async () => {
    const { service, prisma } = setup();
    prisma.turno.findMany.mockResolvedValueOnce([
      {
        id: 't1',
        proyectoId: 'p1',
        fecha: hoy,
        proyecto: { codigo: '26-001', nombre: 'Obra' },
      },
    ]);
    const pdr = await service.inicio(user('pdr'));
    expect(pdr.tareas[0]).toEqual(
      expect.objectContaining({
        titulo: 'Cierra la jornada de asistencia',
        href: '/asistencia/turno/p1',
      }),
    );
    expect(pdr.accionesRapidas[0].id).toBe('asistencia');

    const ti = await service.inicio(user('admin_ti'));
    expect(prisma.requerimiento.findMany).toHaveBeenCalledTimes(1);
    expect(ti.accionesRapidas.map((a) => a.id)).toEqual([
      'usuarios',
      'ordenes',
      'reportes',
    ]);
  });
});

describe('DashboardService.resumen y finanzas', () => {
  it('arma indicadores de proyectos, requerimientos, cotizaciones, órdenes e inventario', async () => {
    const { service, prisma } = setup();
    const ahora = new Date();
    prisma.proyecto.findMany.mockResolvedValue([
      { estado: 'ejecucion' },
      { estado: 'ejecucion' },
      { estado: 'cierre' },
    ]);
    prisma.hito.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    prisma.requerimiento.findMany.mockResolvedValue([
      { creadoEn: new Date(ahora.getTime() - DIA) },
    ]);
    prisma.requerimientoHistorial.findMany
      .mockResolvedValueOnce([
        { creadoEn: new Date(ahora.getTime() - DIA), requerimientoId: 'r1' },
      ])
      .mockResolvedValueOnce([
        {
          creadoEn: new Date(ahora.getTime() - DIA),
          requerimiento: { creadoEn: new Date(ahora.getTime() - 3 * DIA) },
        },
      ]);
    prisma.requerimiento.count
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1);
    prisma.solicitudCotizacion.findMany.mockResolvedValue([
      {
        estado: 'enviada',
        actualizadoEn: new Date(ahora.getTime() - 10 * DIA),
      },
      { estado: 'aprobada_gerencia', actualizadoEn: ahora },
      { estado: 'orden_generada', actualizadoEn: ahora },
    ]);
    prisma.solicitudItem.findMany.mockResolvedValue([
      {
        cotizacionItems: [
          { precioUnit: '10', cantidad: '5', seleccionado: true },
          { precioUnit: '14', cantidad: '5', seleccionado: false },
        ],
      },
      {
        cotizacionItems: [
          { precioUnit: '10', cantidad: '1', seleccionado: true },
        ],
      },
    ]);
    prisma.ordenCompra.findMany.mockResolvedValue([
      { creadoEn: ahora, montoTotal: '1200' },
    ]);
    prisma.ordenCompra.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    prisma.itemInventario.findMany.mockResolvedValue([
      { tipo: 'consumible' },
      { tipo: 'activo' },
    ]);
    prisma.almacen.findMany.mockResolvedValue([{ tipo: 'fijo' }]);

    const r = await service.resumen();
    expect(r.proyectos).toEqual({
      total: 3,
      porEstado: { planificacion: 0, ejecucion: 2, cierre: 1, liquidada: 0 },
      hitosProximos7dias: 2,
      hitosIncumplidos: 1,
    });
    expect(r.requerimientos).toEqual(
      expect.objectContaining({
        pendientesAprobacion: 4,
        urgentesPendientes: 1,
        tiempoPromedioAprobacionDias: 2,
      }),
    );
    expect(r.requerimientos.tendenciaSemanal.at(-1)).toEqual(
      expect.objectContaining({ creados: 1, aprobados: 1 }),
    );
    expect(r.cotizaciones).toEqual(
      expect.objectContaining({
        solicitudesEnCurso: 2,
        estancadasMas5Dias: 1,
        ahorroAdjudicacion: 10,
      }),
    );
    expect(
      r.cotizaciones.funnelPorEstado.find((f) => f.etapa === 'aprobada')?.value,
    ).toBe(1);
    expect(r.ordenesCompra.montoPorMes.at(-1)?.monto).toBe(1200);
    expect(r.inventario).toEqual({
      itemsActivos: 2,
      itemsPorTipo: { consumible: 1, activo: 1 },
      almacenesActivos: 1,
      almacenesPorTipo: { fijo: 1, temporal: 0 },
    });
  });

  it('sin aprobaciones recientes no calcula tiempo promedio', async () => {
    const { service } = setup();
    const r = await service.resumen();
    expect(r.requerimientos.tiempoPromedioAprobacionDias).toBeNull();
  });

  it('finanzas separa pendiente, vencido, próximo y pagado del mes', async () => {
    const { service, prisma } = setup();
    const ahora = new Date();
    prisma.pago.findMany.mockResolvedValue([
      {
        estado: 'pendiente',
        monto: '100',
        fechaProgramada: enDias(-3),
        fechaPagoReal: null,
      },
      {
        estado: 'pendiente',
        monto: '200',
        fechaProgramada: enDias(2),
        fechaPagoReal: null,
      },
      {
        estado: 'pendiente',
        monto: '50',
        fechaProgramada: enDias(30),
        fechaPagoReal: null,
      },
      {
        estado: 'pagado',
        monto: '400',
        fechaProgramada: ahora,
        fechaPagoReal: ahora,
      },
    ]);
    const r = await service.finanzas();
    expect(r).toEqual(
      expect.objectContaining({
        totalPendiente: 350,
        totalVencido: 100,
        proximos7dias: 200,
        pagadoMes: 400,
      }),
    );
    expect(r.montoPorMes).toHaveLength(6);
    expect(r.montoPorMes.at(-1)?.pagado).toBe(400);
  });
});
