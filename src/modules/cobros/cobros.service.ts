import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { hoyLima } from '../../shared/date/fecha.util.js';
import { MarcarCobradoDto, QueryCobrosDto } from './dto/marcar-cobrado.dto.js';

const COBRO_INCLUDE = {
  proyecto: { select: { id: true, codigo: true, nombre: true } },
  registradoPor: { select: { id: true, name: true } },
  cobradoPor: { select: { id: true, name: true } },
} as const;

function withEstadoEfectivo<T extends { estado: string; fechaProgramada: Date }>(cobro: T) {
  const vencido = cobro.estado === 'pendiente' && cobro.fechaProgramada < hoyLima();
  return { ...cobro, estadoEfectivo: vencido ? 'vencido' : cobro.estado };
}

@Injectable()
export class CobrosService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: QueryCobrosDto) {
    const cobros = await this.prisma.cobro.findMany({
      where: {
        estado: query.estado && query.estado !== 'vencido' ? query.estado : undefined,
      },
      include: COBRO_INCLUDE,
      orderBy: { fechaProgramada: 'asc' },
    });
    const decorados = cobros.map(withEstadoEfectivo);
    return query.estado === 'vencido'
      ? decorados.filter((c) => c.estadoEfectivo === 'vencido')
      : decorados;
  }

  async findOne(id: string) {
    const cobro = await this.prisma.cobro.findUnique({
      where: { id },
      include: COBRO_INCLUDE,
    });
    if (!cobro) throw new NotFoundException(`Cobro ${id} no encontrado`);
    return withEstadoEfectivo(cobro);
  }

  async marcarCobrado(id: string, dto: MarcarCobradoDto, userId: string) {
    const existing = await this.findOne(id);
    if (existing.estado !== 'pendiente')
      throw new BadRequestException(
        `No se puede marcar como cobrado un cobro en estado "${existing.estado}"`,
      );

    const cobro = await this.prisma.cobro.update({
      where: { id },
      data: {
        estado: 'cobrado',
        fechaCobrada: dto.fechaCobrada ? new Date(dto.fechaCobrada) : new Date(),
        cobradoPorId: userId,
      },
      include: COBRO_INCLUDE,
    });
    return withEstadoEfectivo(cobro);
  }

  async resumen() {
    const cobros = await this.prisma.cobro.findMany({
      where: { estado: { in: ['pendiente', 'cobrado'] } },
      select: { estado: true, monto: true, fechaProgramada: true, fechaCobrada: true },
    });

    const hoy = new Date();
    const en7dias = new Date(hoy.getTime() + 7 * 24 * 60 * 60 * 1000);
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    let totalPendiente = 0;
    let totalVencido = 0;
    let proximos7dias = 0;
    let cobradoMes = 0;

    for (const c of cobros) {
      const monto = Number(c.monto);
      if (c.estado === 'pendiente') {
        totalPendiente += monto;
        if (c.fechaProgramada < hoy) totalVencido += monto;
        else if (c.fechaProgramada <= en7dias) proximos7dias += monto;
      } else if (c.estado === 'cobrado' && c.fechaCobrada && c.fechaCobrada >= inicioMes) {
        cobradoMes += monto;
      }
    }

    return { totalPendiente, totalVencido, proximos7dias, cobradoMes };
  }
}
