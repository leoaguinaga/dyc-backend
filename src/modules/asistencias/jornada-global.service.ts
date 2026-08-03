import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { soloFechaUTC } from '../../shared/date/fecha.util.js';

export interface ListarJornadasParams {
  proyectoId?: string;
  desde?: string;
  hasta?: string;
}

@Injectable()
export class JornadaGlobalService {
  constructor(private prisma: PrismaService) {}

  async listarJornadas(params: ListarJornadasParams) {
    const desdeD = params.desde
      ? soloFechaUTC(new Date(params.desde))
      : undefined;
    const hastaD = params.hasta
      ? soloFechaUTC(new Date(params.hasta))
      : undefined;

    const turnos = await this.prisma.turno.findMany({
      where: {
        ...(params.proyectoId ? { proyectoId: params.proyectoId } : {}),
        ...(desdeD || hastaD
          ? {
              fecha: {
                ...(desdeD ? { gte: desdeD } : {}),
                ...(hastaD ? { lte: hastaD } : {}),
              },
            }
          : {}),
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
    }));
  }

  async obtenerJornada(turnoId: string) {
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
      },
    });
    if (!turno) throw new NotFoundException(`Jornada ${turnoId} no encontrada`);

    const trabajadores = turno.asistencias.map((a) => ({
      trabajadorId: a.trabajadorId,
      nombre: a.trabajador.nombre,
      dni: a.trabajador.dni,
      estado: a.estado,
      justificada: a.justificada,
      horasNormales: Number(a.horasNormales),
      horasExtra: Number(a.horasExtra),
      pagarExtra: a.pagarExtra,
      precioHora: a.trabajador.perfilObrero?.precioHora
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
      trabajadores,
      totales: {
        horasNormales: trabajadores.reduce((s, t) => s + t.horasNormales, 0),
        horasExtra: trabajadores.reduce((s, t) => s + t.horasExtra, 0),
      },
    };
  }
}
