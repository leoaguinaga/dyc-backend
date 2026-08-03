import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service.js';
import { soloFechaUTC } from '../../shared/date/fecha.util.js';
import { AppEvents } from '../../shared/events/events.js';

@Injectable()
export class ConsolidadoAsistenciaService {
  constructor(
    private prisma: PrismaService,
    private events: EventEmitter2,
  ) {}

  async consolidadoObra(proyectoId: string, desde: string, hasta: string) {
    const desdeD = soloFechaUTC(new Date(desde));
    const hastaD = soloFechaUTC(new Date(hasta));

    const turnos = await this.prisma.turno.findMany({
      where: { proyectoId, fecha: { gte: desdeD, lte: hastaD } },
      orderBy: { fecha: 'asc' },
      include: { asistencias: { include: { trabajador: true } } },
    });

    const porTurno = turnos.map((t) => ({
      turnoId: t.id,
      fecha: t.fecha,
      estado: t.estado,
      horasNormales: this.sumar(t.asistencias, 'horasNormales'),
      horasExtra: this.sumar(t.asistencias, 'horasExtra'),
      obreros: t.asistencias.length,
    }));

    const porTrabajadorMap = new Map<
      string,
      {
        trabajadorId: string;
        nombre: string;
        horasNormales: number;
        horasExtra: number;
        turnos: number;
      }
    >();
    for (const t of turnos) {
      for (const a of t.asistencias) {
        const acc = porTrabajadorMap.get(a.trabajadorId) ?? {
          trabajadorId: a.trabajadorId,
          nombre: a.trabajador.nombre,
          horasNormales: 0,
          horasExtra: 0,
          turnos: 0,
        };
        acc.horasNormales += Number(a.horasNormales);
        acc.horasExtra += Number(a.horasExtra);
        acc.turnos += 1;
        porTrabajadorMap.set(a.trabajadorId, acc);
      }
    }

    return {
      turnos: porTurno,
      porTrabajador: [...porTrabajadorMap.values()],
      totales: {
        horasNormales: porTurno.reduce((s, t) => s + t.horasNormales, 0),
        horasExtra: porTurno.reduce((s, t) => s + t.horasExtra, 0),
      },
    };
  }

  async consolidadoTrabajador(
    trabajadorId: string,
    desde?: string,
    hasta?: string,
  ) {
    const where: {
      trabajadorId: string;
      turno?: { fecha: { gte?: Date; lte?: Date } };
    } = {
      trabajadorId,
    };
    if (desde || hasta) {
      where.turno = {
        fecha: {
          ...(desde ? { gte: soloFechaUTC(new Date(desde)) } : {}),
          ...(hasta ? { lte: soloFechaUTC(new Date(hasta)) } : {}),
        },
      };
    }

    const asistencias = await this.prisma.asistencia.findMany({
      where,
      orderBy: { turno: { fecha: 'asc' } },
      include: {
        turno: {
          include: {
            proyecto: { select: { id: true, nombre: true, codigo: true } },
          },
        },
      },
    });

    const porObraMap = new Map<
      string,
      {
        proyectoId: string;
        proyectoNombre: string;
        horasNormales: number;
        horasExtra: number;
        turnos: {
          fecha: Date;
          estado: string;
          horasNormales: number;
          horasExtra: number;
        }[];
      }
    >();
    for (const a of asistencias) {
      const proyecto = a.turno.proyecto;
      const acc = porObraMap.get(proyecto.id) ?? {
        proyectoId: proyecto.id,
        proyectoNombre: proyecto.nombre,
        horasNormales: 0,
        horasExtra: 0,
        turnos: [],
      };
      acc.horasNormales += Number(a.horasNormales);
      acc.horasExtra += Number(a.horasExtra);
      acc.turnos.push({
        fecha: a.turno.fecha,
        estado: a.estado,
        horasNormales: Number(a.horasNormales),
        horasExtra: Number(a.horasExtra),
      });
      porObraMap.set(proyecto.id, acc);
    }

    const porObra = [...porObraMap.values()];
    return {
      porObra,
      totales: {
        horasNormales: porObra.reduce((s, o) => s + o.horasNormales, 0),
        horasExtra: porObra.reduce((s, o) => s + o.horasExtra, 0),
      },
    };
  }

  async planillaPreview(
    proyectoId: string,
    desde: string,
    hasta: string,
    valorHoraExtra: number,
  ) {
    const { trabajadores, totalGeneral } = await this.calcularPlanilla(
      proyectoId,
      soloFechaUTC(new Date(desde)),
      soloFechaUTC(new Date(hasta)),
      valorHoraExtra,
    );

    return {
      periodo: { desde, hasta },
      valorHoraExtra,
      trabajadores,
      totalGeneral,
    };
  }

  async generarPlanilla(
    proyectoId: string,
    actorId: string,
    desde: string,
    hasta: string,
    valorHoraExtra: number,
  ) {
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { id: proyectoId },
      select: { id: true, nombre: true, codigo: true },
    });
    if (!proyecto)
      throw new NotFoundException(`Obra ${proyectoId} no encontrada`);

    const desdeD = soloFechaUTC(new Date(desde));
    const hastaD = soloFechaUTC(new Date(hasta));

    const existente = await this.prisma.planilla.findUnique({
      where: {
        proyectoId_periodoInicio_periodoFin: {
          proyectoId,
          periodoInicio: desdeD,
          periodoFin: hastaD,
        },
      },
    });
    if (existente) {
      throw new BadRequestException(
        'Ya existe una planilla generada para esta obra y periodo',
      );
    }

    const { trabajadores, totalGeneral } = await this.calcularPlanilla(
      proyectoId,
      desdeD,
      hastaD,
      valorHoraExtra,
    );
    if (trabajadores.length === 0) {
      throw new BadRequestException(
        'No hay turnos cerrados con asistencia en este periodo',
      );
    }

    const planilla = await this.prisma.planilla.create({
      data: {
        proyectoId,
        periodoInicio: desdeD,
        periodoFin: hastaD,
        valorHoraExtra,
        totalGeneral,
        generadaPorId: actorId,
        items: {
          create: trabajadores.map((t) => ({
            trabajadorId: t.trabajadorId,
            horasNormales: t.horasNormales,
            horasExtraPagable: t.horasExtraPagable,
            precioHora: t.precioHora,
            montoNormal: t.montoNormal,
            montoExtra: t.montoExtra,
            total: t.total,
          })),
        },
      },
      include: {
        generadaPor: { select: { id: true, name: true } },
        items: { include: { trabajador: true } },
      },
    });

    this.events.emit(AppEvents.PLANILLA_GENERADA, {
      planillaId: planilla.id,
      proyectoId: proyecto.id,
      proyectoNombre: proyecto.nombre,
      periodoInicio: desde,
      periodoFin: hasta,
      totalGeneral: totalGeneral.toFixed(2),
    });

    return planilla;
  }

  listarPlanillas(proyectoId: string) {
    return this.prisma.planilla.findMany({
      where: { proyectoId },
      orderBy: { periodoInicio: 'desc' },
      include: { generadaPor: { select: { id: true, name: true } } },
    });
  }

  listarPlanillasGlobal(params: {
    proyectoId?: string;
    desde?: string;
    hasta?: string;
  }) {
    return this.prisma.planilla.findMany({
      where: {
        ...(params.proyectoId ? { proyectoId: params.proyectoId } : {}),
        ...(params.desde
          ? { periodoInicio: { gte: soloFechaUTC(new Date(params.desde)) } }
          : {}),
        ...(params.hasta
          ? { periodoFin: { lte: soloFechaUTC(new Date(params.hasta)) } }
          : {}),
      },
      orderBy: { periodoInicio: 'desc' },
      include: {
        proyecto: { select: { id: true, nombre: true, codigo: true } },
        generadaPor: { select: { id: true, name: true } },
      },
    });
  }

  async obtenerPlanilla(proyectoId: string, planillaId: string) {
    const planilla = await this.prisma.planilla.findFirst({
      where: { id: planillaId, proyectoId },
      include: {
        generadaPor: { select: { id: true, name: true } },
        items: {
          include: { trabajador: { select: { id: true, nombre: true } } },
        },
      },
    });
    if (!planilla)
      throw new NotFoundException(`Planilla ${planillaId} no encontrada`);
    return planilla;
  }

  private async calcularPlanilla(
    proyectoId: string,
    desdeD: Date,
    hastaD: Date,
    valorHoraExtra: number,
  ) {
    const asistencias = await this.prisma.asistencia.findMany({
      where: {
        turno: {
          proyectoId,
          fecha: { gte: desdeD, lte: hastaD },
          estado: 'cerrado',
        },
      },
      include: { trabajador: { include: { perfilObrero: true } } },
    });

    const porTrabajadorMap = new Map<
      string,
      {
        trabajadorId: string;
        nombre: string;
        precioHora: number | null;
        horasNormales: number;
        horasExtraPagable: number;
      }
    >();
    for (const a of asistencias) {
      const acc = porTrabajadorMap.get(a.trabajadorId) ?? {
        trabajadorId: a.trabajadorId,
        nombre: a.trabajador.nombre,
        precioHora: a.trabajador.perfilObrero?.precioHora
          ? Number(a.trabajador.perfilObrero.precioHora)
          : null,
        horasNormales: 0,
        horasExtraPagable: 0,
      };
      acc.horasNormales += Number(a.horasNormales);
      if (a.pagarExtra) acc.horasExtraPagable += Number(a.horasExtra);
      porTrabajadorMap.set(a.trabajadorId, acc);
    }

    const trabajadores = [...porTrabajadorMap.values()].map((t) => {
      const montoNormal =
        t.precioHora != null ? t.horasNormales * t.precioHora : 0;
      const montoExtra = t.horasExtraPagable * valorHoraExtra;
      return {
        ...t,
        montoNormal,
        montoExtra,
        total: montoNormal + montoExtra,
        sinTarifa: t.precioHora == null,
      };
    });

    return {
      trabajadores,
      totalGeneral: trabajadores.reduce((s, t) => s + t.total, 0),
    };
  }

  private sumar<K extends 'horasNormales' | 'horasExtra'>(
    asistencias: { horasNormales: unknown; horasExtra: unknown }[],
    campo: K,
  ): number {
    return asistencias.reduce((s, a) => s + Number(a[campo]), 0);
  }
}
