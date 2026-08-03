import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { hoyLima, soloFechaUTC } from '../../shared/date/fecha.util.js';

export type TipoPersonaAcceso =
  | 'operario'
  | 'staff'
  | 'staff_oficina'
  | 'tercero';

export interface AccesoConsolidadoItem {
  tipo: TipoPersonaAcceso;
  nombre: string;
  dni: string | null;
  empresa: string | null;
  motivo: string | null;
  horaEntrada: Date | null;
  horaSalida: Date | null;
  fecha: Date;
  proyectoId: string;
  proyectoNombre: string;
}

export interface ConsolidadoAccesoParams {
  desde?: string;
  hasta?: string;
  proyectoId?: string;
  tipo?: TipoPersonaAcceso;
}

@Injectable()
export class ConsolidadoAccesoService {
  constructor(private prisma: PrismaService) {}

  async consolidado(
    params: ConsolidadoAccesoParams,
  ): Promise<AccesoConsolidadoItem[]> {
    const desdeD = params.desde
      ? soloFechaUTC(new Date(params.desde))
      : hoyLima();
    const hastaD = params.hasta
      ? soloFechaUTC(new Date(params.hasta))
      : hoyLima();
    const proyectoWhere = params.proyectoId
      ? { proyectoId: params.proyectoId }
      : {};

    const [turnos, visitas, terceros] = await Promise.all([
      this.prisma.turno.findMany({
        where: { ...proyectoWhere, fecha: { gte: desdeD, lte: hastaD } },
        include: {
          asistencias: { include: { trabajador: true } },
          proyecto: { select: { id: true, nombre: true } },
        },
      }),
      this.prisma.registroVisita.findMany({
        where: { ...proyectoWhere, fecha: { gte: desdeD, lte: hastaD } },
        include: {
          trabajador: true,
          user: true,
          proyecto: { select: { id: true, nombre: true } },
        },
      }),
      this.prisma.visitaTercero.findMany({
        where: { ...proyectoWhere, fecha: { gte: desdeD, lte: hastaD } },
        include: {
          visitantes: true,
          proyecto: { select: { id: true, nombre: true } },
        },
      }),
    ]);

    const operarios: AccesoConsolidadoItem[] = turnos.flatMap((turno) =>
      turno.asistencias
        .filter((a) => a.estado !== 'falta')
        .map((a) => ({
          tipo: 'operario' as const,
          nombre: a.trabajador.nombre,
          dni: a.trabajador.dni,
          empresa: null,
          motivo: null,
          horaEntrada: turno.horaAperturaReal,
          horaSalida: turno.horaCierreReal,
          fecha: turno.fecha,
          proyectoId: turno.proyecto.id,
          proyectoNombre: turno.proyecto.nombre,
        })),
    );

    const staff: AccesoConsolidadoItem[] = visitas.map((v) => ({
      tipo: v.tipo,
      nombre:
        v.trabajador?.nombre ??
        v.user?.name ??
        v.nombreLibre ??
        'Sin identificar',
      dni: v.trabajador?.dni ?? null,
      empresa: null,
      motivo: v.motivo,
      horaEntrada: v.horaEntrada,
      horaSalida: v.horaSalida,
      fecha: v.fecha,
      proyectoId: v.proyecto.id,
      proyectoNombre: v.proyecto.nombre,
    }));

    const terceroItems: AccesoConsolidadoItem[] = terceros.flatMap((vt) =>
      vt.visitantes.map((p) => ({
        tipo: 'tercero' as const,
        nombre: p.nombre,
        dni: p.dni,
        empresa: vt.empresaNombre,
        motivo: vt.motivo,
        horaEntrada: p.horaEntrada,
        horaSalida: p.horaSalida,
        fecha: vt.fecha,
        proyectoId: vt.proyecto.id,
        proyectoNombre: vt.proyecto.nombre,
      })),
    );

    let items = [...operarios, ...staff, ...terceroItems];
    if (params.tipo) items = items.filter((i) => i.tipo === params.tipo);

    return items.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  }
}
