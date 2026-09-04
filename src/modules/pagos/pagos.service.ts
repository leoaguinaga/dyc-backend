import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { STORAGE_PROVIDER } from '../../shared/storage/storage.interface.js';
import type { StorageProvider } from '../../shared/storage/storage.interface.js';
import { hoyLima } from '../../shared/date/fecha.util.js';
import type { AuthenticatedUser } from '../../shared/guards/auth.guard.js';
import {
  CreatePagoDto,
  CreateRecordatorioPagoDto,
  CreatePagoRecurrenteDto,
  UpdatePagoRecurrenteDto,
  CreatePlanillaStaffDto,
  MarcarPagadoDto,
  QueryPagosDto,
  ReportePagosDto,
  SubirComprobantePagoDto,
  UpdatePagoDto,
} from './dto/create-pago.dto.js';

const PAGO_INCLUDE = {
  ordenCompra: {
    select: {
      id: true,
      numero: true,
      concepto: true,
      montoTotal: true,
      proveedorNombreLibre: true,
      destinoPago: true,
      pagoMetodo: true,
      pagoBanco: true,
      pagoNumeroCuenta: true,
      pagoTrabajadorBanco: true,
      pagoTrabajadorNumeroCuenta: true,
      pagoTrabajadorNumero: true,
      pagoTrabajador: {
        select: {
          id: true,
          nombre: true,
          banco: true,
          numeroCuenta: true,
          telefono: true,
        },
      },
      proveedor: { select: { id: true, razonSocial: true, banco: true, numeroCuenta: true } },
      proyecto: { select: { id: true, codigo: true, nombre: true } },
      creadoPor: { select: { id: true, name: true } },
    },
  },
  proyecto: { select: { id: true, codigo: true, nombre: true } },
  registradoPor: { select: { id: true, name: true } },
  pagadoPor: { select: { id: true, name: true } },
  beneficiarioTrabajador: {
    select: {
      id: true,
      nombre: true,
      banco: true,
      numeroCuenta: true,
      telefono: true,
    },
  },
} as const;

function withEstadoEfectivo<T extends { estado: string; fechaProgramada: Date }>(pago: T) {
  // Comparación por día calendario (no por hora exacta): un pago programado
  // para hoy no debe marcarse vencido hasta que empiece el día siguiente.
  const vencido = pago.estado === 'pendiente' && pago.fechaProgramada < hoyLima();
  return { ...pago, estadoEfectivo: vencido ? 'vencido' : pago.estado };
}

@Injectable()
export class PagosService {
  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private storage: StorageProvider,
  ) {}

  private esFinanzas(user: AuthenticatedUser) {
    return user.role === 'administrador' || user.role === 'gerencia' || user.role === 'admin_ti' || user.role === 'logistica';
  }

  private alcanceUsuario(user: AuthenticatedUser) {
    if (this.esFinanzas(user)) return {};
    return {
      OR: [
        { registradoPorId: user.id },
        {
          proyecto: {
            OR: [
              { supervisores: { some: { userId: user.id } } },
              { trabajadores: { some: { trabajador: { userId: user.id } } } },
            ],
          },
        },
        {
          ordenCompra: {
            proyecto: {
              OR: [
                { supervisores: { some: { userId: user.id } } },
                { trabajadores: { some: { trabajador: { userId: user.id } } } },
              ],
            },
          },
        },
      ],
    };
  }

  async findAll(query: QueryPagosDto, user: AuthenticatedUser) {
    const proyectoWhere = query.proyectoId
      ? {
          OR: [
            { proyectoId: query.proyectoId },
            { ordenCompra: { proyectoId: query.proyectoId } },
          ],
        }
      : {};

    const pagos = await this.prisma.pago.findMany({
      where: {
        ...this.alcanceUsuario(user),
        estado: query.estado && query.estado !== 'vencido' ? query.estado : undefined,
        ...proyectoWhere,
        centroCosto: query.centroCosto,
        origen: query.origen,
        ordenCompra: query.proveedorId ? { proveedorId: query.proveedorId } : undefined,
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

  async findOneVisible(id: string, user: AuthenticatedUser) {
    const pago = await this.prisma.pago.findFirst({
      where: { id, ...this.alcanceUsuario(user) },
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
        proyectoId: oc.proyectoId,
        concepto: oc.concepto ?? undefined,
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

  async createRecordatorio(dto: CreateRecordatorioPagoDto, user: AuthenticatedUser) {
    if (dto.centroCosto === 'obra' && !dto.proyectoId)
      throw new BadRequestException('Selecciona una obra para el centro de costo');
    if (dto.centroCosto === 'administracion' && dto.proyectoId)
      throw new BadRequestException('Administración no debe asociarse a una obra');
    if (dto.proyectoId) {
      const proyecto = await this.prisma.proyecto.findUnique({ where: { id: dto.proyectoId }, select: { id: true } });
      if (!proyecto) throw new NotFoundException('Obra no encontrada');
    }

    const pago = await this.prisma.pago.create({
      data: {
        origen: 'manual',
        centroCosto: dto.centroCosto,
        proyectoId: dto.centroCosto === 'obra' ? dto.proyectoId : null,
        concepto: dto.concepto.trim(),
        categoria: dto.categoria?.trim() || null,
        monto: dto.monto,
        fechaProgramada: new Date(dto.fechaProgramada),
        tipoBeneficiario: dto.tipoBeneficiario ?? 'otro',
        beneficiarioNombre: dto.beneficiarioNombre?.trim() || null,
        banco: dto.banco?.trim() || null,
        numeroCuenta: dto.numeroCuenta?.trim() || null,
        cci: dto.cci?.trim() || null,
        metodoPago: dto.metodoPago?.trim() || null,
        nota: dto.nota?.trim() || null,
        registradoPorId: user.id,
      },
      include: PAGO_INCLUDE,
    });
    return withEstadoEfectivo(pago);
  }

  async listarRecurrentes() {
    return this.prisma.pagoRecurrente.findMany({
      include: { proyecto: { select: { id: true, codigo: true, nombre: true } } },
      orderBy: [{ activo: 'desc' }, { concepto: 'asc' }],
    });
  }

  async crearRecurrente(dto: CreatePagoRecurrenteDto, userId: string) {
    if (dto.centroCosto === 'obra' && !dto.proyectoId) throw new BadRequestException('Selecciona una obra');
    if (dto.centroCosto === 'administracion' && dto.proyectoId) throw new BadRequestException('Administración no se asocia a una obra');
    if (dto.proyectoId) {
      const proyecto = await this.prisma.proyecto.findUnique({
        where: { id: dto.proyectoId },
        select: { id: true },
      });
      if (!proyecto) throw new NotFoundException('Obra no encontrada');
    }
    return this.prisma.pagoRecurrente.create({ data: {
      concepto: dto.concepto.trim(),
      diaVencimiento: dto.diaVencimiento,
      montoReferencial: dto.montoReferencial,
      categoria: dto.categoria?.trim() || null,
      centroCosto: dto.centroCosto,
      proyectoId: dto.centroCosto === 'obra' ? dto.proyectoId : null,
      beneficiarioNombre: dto.beneficiarioNombre?.trim() || null,
      banco: dto.banco?.trim() || null,
      numeroCuenta: dto.numeroCuenta?.trim() || null,
      cci: dto.cci?.trim() || null,
      creadoPorId: userId,
    } });
  }

  async actualizarRecurrente(id: string, dto: UpdatePagoRecurrenteDto) {
    const existing = await this.prisma.pagoRecurrente.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Pago recurrente no encontrado');

    const centroCosto = dto.centroCosto ?? existing.centroCosto;
    const proyectoId = dto.proyectoId !== undefined ? dto.proyectoId : existing.proyectoId;

    if (centroCosto === 'obra' && !proyectoId) throw new BadRequestException('Selecciona una obra');
    if (centroCosto === 'administracion' && proyectoId) throw new BadRequestException('Administración no se asocia a una obra');

    if (proyectoId) {
      const proyecto = await this.prisma.proyecto.findUnique({
        where: { id: proyectoId },
        select: { id: true },
      });
      if (!proyecto) throw new NotFoundException('Obra no encontrada');
    }

    return this.prisma.pagoRecurrente.update({
      where: { id },
      data: {
        concepto: dto.concepto !== undefined ? dto.concepto.trim() : undefined,
        diaVencimiento: dto.diaVencimiento !== undefined ? dto.diaVencimiento : undefined,
        montoReferencial: dto.montoReferencial !== undefined ? dto.montoReferencial : undefined,
        categoria: dto.categoria !== undefined ? (dto.categoria?.trim() || null) : undefined,
        centroCosto,
        proyectoId: centroCosto === 'obra' ? proyectoId : null,
        beneficiarioNombre: dto.beneficiarioNombre !== undefined ? (dto.beneficiarioNombre?.trim() || null) : undefined,
        banco: dto.banco !== undefined ? (dto.banco?.trim() || null) : undefined,
        numeroCuenta: dto.numeroCuenta !== undefined ? (dto.numeroCuenta?.trim() || null) : undefined,
        cci: dto.cci !== undefined ? (dto.cci?.trim() || null) : undefined,
        activo: dto.activo !== undefined ? dto.activo : undefined,
      },
      include: { proyecto: { select: { id: true, codigo: true, nombre: true } } },
    });
  }

  async eliminarRecurrente(id: string) {
    const existing = await this.prisma.pagoRecurrente.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Pago recurrente no encontrado');

    return this.prisma.pagoRecurrente.delete({
      where: { id },
    });
  }

  async generarRecurrentes(fecha = new Date()) {
    const periodo = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
    const reglas = await this.prisma.pagoRecurrente.findMany({ where: { activo: true } });
    const creados: { id: string }[] = [];
    for (const regla of reglas) {
      const vencimiento = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate();
      const fechaProgramada = new Date(fecha.getFullYear(), fecha.getMonth(), Math.min(regla.diaVencimiento, vencimiento));
      const pago = await this.prisma.pago.upsert({
        where: { recurrenciaId_periodoRecurrente: { recurrenciaId: regla.id, periodoRecurrente: periodo } },
        create: {
          origen: 'recurrente', recurrenciaId: regla.id, periodoRecurrente: periodo,
          centroCosto: regla.centroCosto, proyectoId: regla.proyectoId, concepto: regla.concepto,
          categoria: regla.categoria, beneficiarioNombre: regla.beneficiarioNombre, banco: regla.banco,
          numeroCuenta: regla.numeroCuenta, cci: regla.cci, monto: regla.montoReferencial ?? 0,
          fechaProgramada, estado: 'borrador', registradoPorId: regla.creadoPorId,
        }, update: {},
      });
      creados.push(pago);
    }
    return { periodo, total: creados.length };
  }

  @Cron('10 6 * * *')
  async generarRecurrentesProgramados() {
    await this.generarRecurrentes();
  }

  async listarPlanillaStaff() {
    return this.prisma.planillaStaff.findMany({
      include: { items: { include: { trabajador: { select: { id: true, nombre: true } }, pago: true } } },
      orderBy: { periodo: 'desc' },
    });
  }

  async generarPlanillaStaff(periodo: string, userId: string) {
    if (!/^\d{4}-\d{2}$/.test(periodo)) throw new BadRequestException('Usa el periodo AAAA-MM');
    const perfiles = await this.prisma.perfilStaff.findMany({ where: { activo: true }, include: { trabajador: true } });
    if (!perfiles.length) throw new BadRequestException('No hay staff activo con sueldo configurado');
    return this.prisma.$transaction(async (tx) => {
      const existente = await tx.planillaStaff.findUnique({ where: { periodo } });
      if (existente) throw new BadRequestException('La planilla de este periodo ya existe');
      const total = perfiles.reduce((s, perfil) => s + Number(perfil.sueldoMensual), 0);
      const planilla = await tx.planillaStaff.create({ data: {
        periodo, totalGeneral: total, generadaPorId: userId,
        items: { create: perfiles.map((perfil) => ({ trabajadorId: perfil.trabajadorId, sueldoBase: perfil.sueldoMensual, total: perfil.sueldoMensual })) },
      }, include: { items: true } });
      for (const item of planilla.items) {
        const perfil = perfiles.find((candidate) => candidate.trabajadorId === item.trabajadorId)!;
        const ultimoDia = new Date(Number(periodo.slice(0, 4)), Number(periodo.slice(5, 7)), 0).getDate();
        await tx.pago.create({ data: {
          origen: 'planilla_staff', planillaStaffItemId: item.id, centroCosto: perfil.centroCosto,
          proyectoId: perfil.proyectoId, concepto: `Planilla staff ${periodo} — ${perfil.trabajador.nombre}`,
          tipoBeneficiario: 'trabajador', beneficiarioTrabajadorId: item.trabajadorId,
          beneficiarioNombre: perfil.trabajador.nombre, banco: perfil.trabajador.banco, numeroCuenta: perfil.trabajador.numeroCuenta,
          monto: item.total, fechaProgramada: new Date(Number(periodo.slice(0, 4)), Number(periodo.slice(5, 7)) - 1, Math.min(perfil.diaPago, ultimoDia)), registradoPorId: userId,
        } });
      }
      return planilla;
    });
  }

  async update(id: string, dto: UpdatePagoDto, user: AuthenticatedUser) {
    const existing = await this.findOne(id);
    if (existing.estado !== 'pendiente' && existing.estado !== 'borrador')
      throw new BadRequestException('Solo se pueden editar pagos pendientes o borradores');
    if (!this.esFinanzas(user) && existing.registradoPorId !== user.id)
      throw new BadRequestException('Solo puedes editar recordatorios que registraste');

    let monto: number | undefined;
    if (dto.porcentaje !== undefined) {
      if (!existing.ordenCompraId)
        throw new BadRequestException('Los pagos operativos se editan por monto, no por porcentaje');
      const comprometido = await this.porcentajeComprometido(existing.ordenCompraId, id);
      const disponible = 100 - comprometido;
      if (dto.porcentaje > disponible + 0.01)
        throw new BadRequestException(
          `El porcentaje excede el disponible. Ya hay ${comprometido}% planificado; queda ${disponible.toFixed(2)}%.`,
        );
      monto = (Number(existing.ordenCompra!.montoTotal) * dto.porcentaje) / 100;
    }

    const pago = await this.prisma.pago.update({
      where: { id },
      data: {
        monto: dto.monto ?? monto,
        porcentaje: dto.porcentaje,
        fechaProgramada: dto.fechaProgramada ? new Date(dto.fechaProgramada) : undefined,
        metodoPago: dto.metodoPago,
        nota: dto.nota,
        concepto: dto.concepto,
        categoria: dto.categoria,
        beneficiarioNombre: dto.beneficiarioNombre,
        banco: dto.banco,
        numeroCuenta: dto.numeroCuenta,
        cci: dto.cci,
        estado: existing.estado === 'borrador' && (dto.monto ?? 0) > 0 ? 'pendiente' : undefined,
      },
      include: PAGO_INCLUDE,
    });
    return withEstadoEfectivo(pago);
  }

  async marcarPagado(id: string, dto: MarcarPagadoDto, userId: string) {
    const existing = await this.findOne(id);
    if (existing.estado !== 'pendiente')
      throw new BadRequestException(`No se puede marcar como pagado un pago en estado "${existing.estado}"`);
    const metodo = dto.metodoPago ?? existing.metodoPago;
    const tieneCuenta =
      existing.numeroCuenta ||
      existing.cci ||
      existing.ordenCompra?.pagoNumeroCuenta ||
      existing.ordenCompra?.pagoTrabajadorNumeroCuenta ||
      existing.ordenCompra?.proveedor?.numeroCuenta;
    if (metodo?.toLowerCase().includes('transfer') && !tieneCuenta)
      throw new BadRequestException('Registra número de cuenta o CCI antes de ejecutar una transferencia');

    const pago = await this.prisma.pago.update({
      where: { id },
      data: {
        estado: 'pagado',
        fechaPagoReal: dto.fechaPagoReal ? new Date(dto.fechaPagoReal) : new Date(),
        metodoPago: dto.metodoPago ?? existing.metodoPago,
        numeroOperacion: dto.numeroOperacion,
        comprobanteNombre: dto.comprobanteNombre ?? existing.comprobanteNombre,
        comprobanteUrl: dto.comprobanteUrl ?? existing.comprobanteUrl,
        pagadoPorId: userId,
      },
      include: PAGO_INCLUDE,
    });
    return withEstadoEfectivo(pago);
  }

  subirComprobante(file: Express.Multer.File) {
    return this.storage.save({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      folder: 'pagos',
    });
  }

  async guardarComprobante(id: string, dto: SubirComprobantePagoDto) {
    await this.findOne(id);
    const pago = await this.prisma.pago.update({
      where: { id },
      data: {
        comprobanteNombre: dto.comprobanteNombre,
        comprobanteUrl: dto.comprobanteUrl,
      },
      include: PAGO_INCLUDE,
    });
    return withEstadoEfectivo(pago);
  }

  async cancelar(id: string, user: AuthenticatedUser) {
    const existing = await this.findOne(id);
    if (existing.estado !== 'pendiente')
      throw new BadRequestException('Solo se pueden cancelar pagos pendientes');
    if (!this.esFinanzas(user) && existing.registradoPorId !== user.id)
      throw new BadRequestException('Solo puedes cancelar recordatorios que registraste');

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

  /** Datos agrupados por proyecto para el reporte diario (vista y PNG comparten esta consulta). */
  async datosReporte(query: ReportePagosDto) {
    const fecha = new Date(`${query.fecha}T00:00:00`);
    const finDelDia = new Date(fecha.getTime() + 24 * 60 * 60 * 1000);

    const proyectoWhere = query.proyectoId
      ? {
          OR: [
            { proyectoId: query.proyectoId },
            { ordenCompra: { proyectoId: query.proyectoId } },
          ],
        }
      : {};

    const pagos = await this.prisma.pago.findMany({
      where: {
        ...(query.tipo === 'pendientes'
          ? {
              estado: 'pendiente',
              fechaProgramada: { lt: finDelDia },
            }
          : {
              estado: 'pagado',
              fechaPagoReal: { gte: fecha, lt: finDelDia },
            }),
        ...proyectoWhere,
      },
      include: PAGO_INCLUDE,
      orderBy: { fechaProgramada: 'asc' },
    });

    const decorados = pagos.map(withEstadoEfectivo);
    const porProyecto = new Map<
      string,
      { proyecto: { id: string; codigo: string | null; nombre: string }; pagos: typeof decorados }
    >();
    for (const pago of decorados) {
      const proyecto = pago.proyecto ?? pago.ordenCompra?.proyecto ?? {
        id: 'administracion', codigo: 'ADM', nombre: 'Administración / Oficina',
      };
      if (!porProyecto.has(proyecto.id)) porProyecto.set(proyecto.id, { proyecto, pagos: [] });
      porProyecto.get(proyecto.id)!.pagos.push(pago);
    }

    const grupos = [...porProyecto.values()].map((g) => ({
      proyecto: g.proyecto,
      pagos: g.pagos.map((p) => ({
        codigo: p.ordenCompra?.numero ?? 'MANUAL',
        concepto:
          p.concepto ??
          p.ordenCompra?.concepto ??
          p.ordenCompra?.proveedor?.razonSocial ??
          p.ordenCompra?.proveedorNombreLibre ??
          'Sin concepto',
        monto: Number(p.monto),
        estadoEfectivo: p.estadoEfectivo,
      })),
      subtotal: g.pagos.reduce((s, p) => s + Number(p.monto), 0),
    }));

    return {
      fecha: query.fecha,
      tipo: query.tipo,
      grupos,
      total: grupos.reduce((s, g) => s + g.subtotal, 0),
    };
  }
}
