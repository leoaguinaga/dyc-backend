import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { hoyLima, soloFechaUTC } from '../../shared/date/fecha.util.js';
import type { Role } from '../../prisma/types.js';

export interface ListarJornadasParams {
  proyectoId?: string;
  desde?: string;
  hasta?: string;
  estado?: 'sin_cerrar' | 'por_revisar' | 'cerrada';
}

@Injectable()
export class JornadaGlobalService {
  constructor(private prisma: PrismaService) {}

  /**
   * Estado de hoy por obra, para las tarjetas de /asistencia. El alcance sale
   * del rol: pdr solo ve las obras donde es prevencionista; administración,
   * gerencia, admin_ti y jefe_sig ven todas y pueden abrir o continuar el turno;
   * el prevencionista solo el de sus obras (mismo criterio que
   * ResponsableAsistenciaGuard).
   */
  async obrasHoy(userId: string, role: Role) {
    const hoy = hoyLima();

    let prevencionistaId: string | undefined;
    if (role === 'pdr') {
      const trabajador = await this.prisma.trabajador.findUnique({
        where: { userId },
        select: { id: true },
      });
      prevencionistaId = trabajador?.id ?? '__none__';
    }

    const proyectos = await this.prisma.proyecto.findMany({
      where: {
        estado: { in: ['planificacion', 'ejecucion'] },
        ...(prevencionistaId ? { prevencionistaId } : {}),
      },
      orderBy: { nombre: 'asc' },
      select: {
        id: true,
        nombre: true,
        codigo: true,
        turnoConfigs: {
          where: { activo: true },
          select: { id: true, nombre: true, horaInicio: true, horaFin: true },
          orderBy: { horaInicio: 'asc' },
        },
        turnos: {
          where: { fecha: hoy },
          select: {
            id: true,
            estado: true,
            turnoConfig: { select: { nombre: true } },
            _count: { select: { asistencias: true } },
          },
        },
      },
    });

    const puedeOperarTodo =
      role === 'administrador' ||
      role === 'gerencia' ||
      role === 'admin_ti' ||
      role === 'jefe_sig';

    return {
      fecha: hoy.toISOString().slice(0, 10),
      obras: proyectos.map((p) => ({
        proyectoId: p.id,
        nombre: p.nombre,
        codigo: p.codigo,
        horarios: p.turnoConfigs,
        turnos: p.turnos.map((t) => ({
          id: t.id,
          estado: t.estado,
          horario: t.turnoConfig.nombre,
          obreros: t._count.asistencias,
        })),
        puedeOperar: puedeOperarTodo || role === 'pdr',
      })),
    };
  }

  /** Conteos globales para avisos: no dependen del rango de fechas del historial. */
  async pendientes() {
    const hoy = hoyLima();
    const [sinCerrar, masAntigua, porRevisar] = await Promise.all([
      this.prisma.turno.count({
        where: { estado: 'abierto', fecha: { lt: hoy } },
      }),
      this.prisma.turno.findFirst({
        where: { estado: 'abierto', fecha: { lt: hoy } },
        orderBy: { fecha: 'asc' },
        select: { fecha: true },
      }),
      this.prisma.turno.count({
        where: { cierreAutomatico: true, cierreRevisadoEn: null },
      }),
    ]);
    return {
      sinCerrar,
      masAntigua: masAntigua?.fecha.toISOString().slice(0, 10) ?? null,
      porRevisar,
    };
  }

  async listarJornadas(params: ListarJornadasParams) {
    const desdeD = params.desde
      ? soloFechaUTC(new Date(params.desde))
      : undefined;
    const hastaD = params.hasta
      ? soloFechaUTC(new Date(params.hasta))
      : undefined;

    // "Sin cerrar" son las abiertas de días anteriores: el tope superior es ayer.
    const hoy = hoyLima();
    const ayer = new Date(hoy.getTime() - 86_400_000);
    const hastaEfectivo =
      params.estado === 'sin_cerrar' && (!hastaD || hastaD > ayer)
        ? ayer
        : hastaD;
    const fechaFiltro =
      desdeD || hastaEfectivo
        ? {
            ...(desdeD ? { gte: desdeD } : {}),
            ...(hastaEfectivo ? { lte: hastaEfectivo } : {}),
          }
        : undefined;

    const turnos = await this.prisma.turno.findMany({
      where: {
        ...(params.proyectoId ? { proyectoId: params.proyectoId } : {}),
        ...(params.estado === 'sin_cerrar'
          ? { estado: 'abierto' as const }
          : {}),
        ...(params.estado === 'por_revisar'
          ? { cierreAutomatico: true, cierreRevisadoEn: null }
          : {}),
        ...(params.estado === 'cerrada' ? { estado: 'cerrado' as const } : {}),
        ...(fechaFiltro ? { fecha: fechaFiltro } : {}),
      },
      orderBy: { fecha: 'desc' },
      include: {
        proyecto: { select: { id: true, nombre: true, codigo: true } },
        turnoConfig: { select: { nombre: true } },
        asistencias: true,
      },
    });

    return turnos.map((t) => ({
      id: t.id,
      fecha: t.fecha,
      estado: t.estado,
      proyectoId: t.proyecto.id,
      proyectoNombre: t.proyecto.nombre,
      proyectoCodigo: t.proyecto.codigo,
      turnoNombre: t.turnoConfig.nombre,
      obreros: t.asistencias.length,
      horasNormales: t.asistencias.reduce(
        (s, a) => s + Number(a.horasNormales),
        0,
      ),
      horasExtra: t.asistencias.reduce((s, a) => s + Number(a.horasExtra), 0),
      origen: t.origen,
      cierreAutomatico: t.cierreAutomatico,
      cierreRevisado: t.cierreRevisadoEn !== null,
    }));
  }

  async obtenerJornada(turnoId: string, role: Role) {
    const turno = await this.prisma.turno.findUnique({
      where: { id: turnoId },
      include: {
        proyecto: { select: { id: true, nombre: true, codigo: true } },
        turnoConfig: { select: { nombre: true } },
        asistencias: {
          include: { trabajador: { include: { perfilObrero: true } } },
        },
        abiertoPor: { select: { id: true, name: true } },
        cerradoPor: { select: { id: true, name: true } },
        corregidoPor: { select: { id: true, name: true } },
      },
    });
    if (!turno) throw new NotFoundException(`Jornada ${turnoId} no encontrada`);

    const trabajadores = turno.asistencias.map((a) => ({
      trabajadorId: a.trabajadorId,
      nombre: a.trabajador.nombre,
      dni: a.trabajador.dni,
      estado: a.estado,
      justificada: a.justificada,
      horaLlegadaReal: a.horaLlegadaReal,
      horaSalidaReal: a.horaSalidaReal,
      salidaTempranaHora: a.salidaTempranaHora,
      horasNormales: Number(a.horasNormales),
      horasExtra: Number(a.horasExtra),
      pagarExtra: a.pagarExtra,
      // Jefe SIG opera la jornada pero no ve tarifas por trabajador.
      precioHora:
        role !== 'jefe_sig' && a.trabajador.perfilObrero?.precioHora
          ? Number(a.trabajador.perfilObrero.precioHora)
          : null,
    }));

    return {
      id: turno.id,
      fecha: turno.fecha,
      estado: turno.estado,
      horaAperturaReal: turno.horaAperturaReal,
      horaCierreReal: turno.horaCierreReal,
      proyectoId: turno.proyecto.id,
      proyectoNombre: turno.proyecto.nombre,
      proyectoCodigo: turno.proyecto.codigo,
      turnoNombre: turno.turnoConfig.nombre,
      abiertoPor: turno.abiertoPor,
      cerradoPor: turno.cerradoPor,
      corregidoPor: turno.corregidoPor,
      corregidoEn: turno.corregidoEn,
      motivoCorreccion: turno.motivoCorreccion,
      origen: turno.origen,
      fotoUrl: turno.fotoUrl,
      fotoOmitida: turno.fotoOmitida,
      cierreAutomatico: turno.cierreAutomatico,
      cierreRevisado: turno.cierreRevisadoEn !== null,
      trabajadores,
      totales: {
        horasNormales: trabajadores.reduce((s, t) => s + t.horasNormales, 0),
        horasExtra: trabajadores.reduce((s, t) => s + t.horasExtra, 0),
      },
    };
  }
}
