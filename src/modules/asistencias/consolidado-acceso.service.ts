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
}

@Injectable()
export class ConsolidadoAccesoService {
  constructor(private prisma: PrismaService) {}

  async consolidado(
    proyectoId: string,
    fecha?: string,
  ): Promise<AccesoConsolidadoItem[]> {
    const dia = fecha ? this.soloFecha(new Date(fecha)) : this.hoy();

    const [turno, visitas, terceros] = await Promise.all([
      this.prisma.turno.findUnique({
        where: { proyectoId_fecha: { proyectoId, fecha: dia } },
        include: { asistencias: { include: { trabajador: true } } },
      }),
      this.prisma.registroVisita.findMany({
        where: { proyectoId, fecha: dia },
        include: { trabajador: true, user: true },
      }),
      this.prisma.visitaTercero.findMany({
        where: { proyectoId, fecha: dia },
        include: { visitantes: true },
      }),
    ]);

    const operarios: AccesoConsolidadoItem[] = (turno?.asistencias ?? [])
      .filter((a) => a.estado !== 'falta')
      .map((a) => ({
        tipo: 'operario' as const,
        nombre: a.trabajador.nombre,
        dni: a.trabajador.dni,
        empresa: null,
        motivo: null,
        horaEntrada: turno!.horaAperturaReal,
        horaSalida: turno!.horaCierreReal,
      }));

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
      })),
    );

    return [...operarios, ...staff, ...terceroItems];
  }

  private hoy(): Date {
    return hoyLima();
  }

  private soloFecha(d: Date): Date {
    return soloFechaUTC(d);
  }
}
