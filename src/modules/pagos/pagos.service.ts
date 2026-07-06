import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  CreatePagoDto,
  MarcarPagadoDto,
  QueryPagosDto,
  UpdatePagoDto,
} from './dto/create-pago.dto.js';

const PAGO_INCLUDE = {
  ordenCompra: {
    select: {
      id: true,
      numero: true,
      montoTotal: true,
      proveedor: { select: { id: true, razonSocial: true } },
      proyecto: { select: { id: true, codigo: true, nombre: true } },
    },
  },
  registradoPor: { select: { id: true, name: true } },
  pagadoPor: { select: { id: true, name: true } },
} as const;

function withEstadoEfectivo<T extends { estado: string; fechaProgramada: Date }>(pago: T) {
  const vencido = pago.estado === 'pendiente' && pago.fechaProgramada < new Date();
  return { ...pago, estadoEfectivo: vencido ? 'vencido' : pago.estado };
}

@Injectable()
export class PagosService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: QueryPagosDto) {
    const pagos = await this.prisma.pago.findMany({
      where: {
        estado: query.estado && query.estado !== 'vencido' ? query.estado : undefined,
        ordenCompra: {
          proyectoId: query.proyectoId,
          proveedorId: query.proveedorId,
        },
      },
      include: PAGO_INCLUDE,
      orderBy: { fechaProgramada: 'asc' },
    });
    const decorados = pagos.map(withEstadoEfectivo);
    return query.estado === 'vencido'
      ? decorados.filter((p) => p.estadoEfectivo === 'vencido')
      : decorados;
  }

  async findByOrden(ordenCompraId: string) {
    const pagos = await this.prisma.pago.findMany({
      where: { ordenCompraId },
      include: PAGO_INCLUDE,
      orderBy: { fechaProgramada: 'asc' },
    });
    return pagos.map(withEstadoEfectivo);
  }

  async findOne(id: string) {
    const pago = await this.prisma.pago.findUnique({
      where: { id },
      include: PAGO_INCLUDE,
    });
    if (!pago) throw new NotFoundException(`Pago ${id} no encontrado`);
    return withEstadoEfectivo(pago);
  }

  /** Suma de % de tramos activos (pendiente/pagado) de una OC, opcionalmente excluyendo un tramo (para updates). */
  private async porcentajeComprometido(ordenCompraId: string, excludePagoId?: string) {
    const pagos = await this.prisma.pago.findMany({
      where: {
        ordenCompraId,
        estado: { in: ['pendiente', 'pagado'] },
        id: excludePagoId ? { not: excludePagoId } : undefined,
      },
      select: { porcentaje: true },
    });
    return pagos.reduce((s, p) => s + Number(p.porcentaje), 0);
  }

  async create(dto: CreatePagoDto, userId: string) {
    const oc = await this.prisma.ordenCompra.findUnique({ where: { id: dto.ordenCompraId } });
    if (!oc) throw new NotFoundException('Orden de compra no encontrada');

    const comprometido = await this.porcentajeComprometido(dto.ordenCompraId);
    const disponible = 100 - comprometido;
    if (dto.porcentaje > disponible + 0.01)
      throw new BadRequestException(
        `El porcentaje excede el disponible. Ya hay ${comprometido}% planificado; queda ${disponible.toFixed(2)}%.`,
      );

    const monto = (Number(oc.montoTotal) * dto.porcentaje) / 100;

    const pago = await this.prisma.pago.create({
      data: {
        ordenCompraId: dto.ordenCompraId,
        monto,
        porcentaje: dto.porcentaje,
        fechaProgramada: new Date(dto.fechaProgramada),
        metodoPago: dto.metodoPago,
        nota: dto.nota,
        registradoPorId: userId,
      },
      include: PAGO_INCLUDE,
    });
    return withEstadoEfectivo(pago);
  }

  async update(id: string, dto: UpdatePagoDto) {
    const existing = await this.findOne(id);
    if (existing.estado !== 'pendiente')
      throw new BadRequestException('Solo se pueden editar pagos pendientes');

    let monto: number | undefined;
    if (dto.porcentaje !== undefined) {
      const comprometido = await this.porcentajeComprometido(existing.ordenCompraId, id);
      const disponible = 100 - comprometido;
      if (dto.porcentaje > disponible + 0.01)
        throw new BadRequestException(
          `El porcentaje excede el disponible. Ya hay ${comprometido}% planificado; queda ${disponible.toFixed(2)}%.`,
        );
      monto = (Number(existing.ordenCompra.montoTotal) * dto.porcentaje) / 100;
    }

    const pago = await this.prisma.pago.update({
      where: { id },
      data: {
        monto,
        porcentaje: dto.porcentaje,
        fechaProgramada: dto.fechaProgramada ? new Date(dto.fechaProgramada) : undefined,
        metodoPago: dto.metodoPago,
        nota: dto.nota,
      },
      include: PAGO_INCLUDE,
    });
    return withEstadoEfectivo(pago);
  }

  async marcarPagado(id: string, dto: MarcarPagadoDto, userId: string) {
    const existing = await this.findOne(id);
    if (existing.estado !== 'pendiente')
      throw new BadRequestException(`No se puede marcar como pagado un pago en estado "${existing.estado}"`);

    const pago = await this.prisma.pago.update({
      where: { id },
      data: {
        estado: 'pagado',
        fechaPagoReal: dto.fechaPagoReal ? new Date(dto.fechaPagoReal) : new Date(),
        metodoPago: dto.metodoPago ?? existing.metodoPago,
        numeroOperacion: dto.numeroOperacion,
        pagadoPorId: userId,
      },
      include: PAGO_INCLUDE,
    });
    return withEstadoEfectivo(pago);
  }

  async cancelar(id: string) {
    const existing = await this.findOne(id);
    if (existing.estado !== 'pendiente')
      throw new BadRequestException('Solo se pueden cancelar pagos pendientes');

    const pago = await this.prisma.pago.update({
      where: { id },
      data: { estado: 'cancelado' },
      include: PAGO_INCLUDE,
    });
    return withEstadoEfectivo(pago);
  }

  async remove(id: string) {
    const existing = await this.findOne(id);
    if (existing.estado !== 'pendiente')
      throw new BadRequestException('Solo se pueden eliminar pagos pendientes');
    await this.prisma.pago.delete({ where: { id } });
  }

  async resumen() {
    const pagos = await this.prisma.pago.findMany({
      where: { estado: { in: ['pendiente', 'pagado'] } },
      select: { estado: true, monto: true, fechaProgramada: true, fechaPagoReal: true },
    });

    const hoy = new Date();
    const en7dias = new Date(hoy.getTime() + 7 * 24 * 60 * 60 * 1000);
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    let totalPendiente = 0;
    let totalVencido = 0;
    let proximos7dias = 0;
    let pagadoMes = 0;

    for (const p of pagos) {
      const monto = Number(p.monto);
      if (p.estado === 'pendiente') {
        totalPendiente += monto;
        if (p.fechaProgramada < hoy) totalVencido += monto;
        else if (p.fechaProgramada <= en7dias) proximos7dias += monto;
      } else if (p.estado === 'pagado' && p.fechaPagoReal && p.fechaPagoReal >= inicioMes) {
        pagadoMes += monto;
      }
    }

    return { totalPendiente, totalVencido, proximos7dias, pagadoMes };
  }
}
