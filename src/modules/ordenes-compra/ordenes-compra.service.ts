import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  CreateOrdenCompraDto,
  RecibirOrdenCompraDto,
  UpdateOrdenCompraDto,
} from './dto/create-orden.dto.js';
import {
  CreateOrdenItemDto,
  UpdateOrdenItemDto,
} from './dto/orden-item.dto.js';
import type { EstadoOrdenCompra } from '../../../prisma/generated/prisma/enums.js';
import { AppEvents } from '../../shared/events/events.js';

const OC_INCLUDE = {
  solicitud: {
    select: {
      id: true,
      codigo: true,
      estado: true,
      requerimiento: { select: { id: true, codigo: true, tipo: true } },
    },
  },
  proveedor: {
    select: {
      id: true,
      razonSocial: true,
      ruc: true,
      direccion: true,
      banco: true,
      numeroCuenta: true,
      moneda: true,
      condicionPago: true,
      contactos: {
        where: { activo: true },
        select: { nombre: true, telefono: true },
        orderBy: { esPrincipal: 'desc' },
        take: 1,
      },
    },
  },
  proyecto: {
    select: { id: true, codigo: true, nombre: true, direccion: true },
  },
  creadoPor: { select: { id: true, name: true, email: true } },
  items: true,
} as const;

@Injectable()
export class OrdenesCompraService {
  constructor(
    private prisma: PrismaService,
    private events: EventEmitter2,
  ) {}

  findAll(query: { estado?: EstadoOrdenCompra; proyectoId?: string }) {
    return this.prisma.ordenCompra.findMany({
      where: {
        estado: query.estado,
        proyectoId: query.proyectoId,
      },
      include: {
        proveedor: { select: { id: true, razonSocial: true } },
        proyecto: { select: { id: true, codigo: true, nombre: true } },
        solicitud: {
          select: {
            id: true,
            codigo: true,
            requerimiento: { select: { id: true, codigo: true, tipo: true } },
          },
        },
        _count: { select: { items: true } },
      },
      orderBy: { creadoEn: 'desc' },
    });
  }

  async findOne(id: string) {
    const oc = await this.prisma.ordenCompra.findUnique({
      where: { id },
      include: OC_INCLUDE,
    });
    if (!oc) throw new NotFoundException(`Orden de compra ${id} no encontrada`);

    if (!oc.fechaEntrega) {
      const cotizacion = await this.prisma.cotizacion.findFirst({
        where: {
          solicitudId: oc.solicitudId,
          proveedorId: oc.proveedorId,
        },
        select: { fechaEntrega: true },
      });
      if (cotizacion?.fechaEntrega) {
        (oc as any).fechaEntrega = cotizacion.fechaEntrega;
      }
    }

    return oc;
  }

  async create(dto: CreateOrdenCompraDto, userId: string) {
    const solicitud = await this.prisma.solicitudCotizacion.findUnique({
      where: { id: dto.solicitudId },
      include: {
        cotizaciones: {
          include: {
            items: true,
            proveedor: { select: { id: true, condicionPago: true } },
            condicionesPago: true,
          },
        },
        requerimiento: { select: { proyectoId: true, nombre: true } },
      },
    });

    if (!solicitud)
      throw new NotFoundException('Solicitud de cotización no encontrada');
    if (solicitud.estado !== 'aprobada_gerencia')
      throw new BadRequestException(
        'Solo se puede generar una OC de solicitudes aprobadas por gerencia',
      );

    const proyectoId =
      solicitud.proyectoId ?? solicitud.requerimiento?.proyectoId;
    if (!proyectoId)
      throw new BadRequestException(
        'No se pudo determinar el proyecto de la solicitud',
      );

    // ── Split award: agrupar ítems seleccionados por proveedor ──────────────
    type Cotizacion = (typeof solicitud.cotizaciones)[0];
    type Grupo = {
      proveedorId: string;
      items: Cotizacion['items'];
      condicionPago?: string | null;
      condicionesPago: Cotizacion['condicionesPago'];
      incluyeIgv: boolean;
    };
    const byProveedor = new Map<string, Grupo>();
    for (const cot of solicitud.cotizaciones) {
      const selected = cot.items.filter((i) => i.seleccionado);
      if (selected.length === 0) continue;
      if (!byProveedor.has(cot.proveedorId)) {
        byProveedor.set(cot.proveedorId, {
          proveedorId: cot.proveedorId,
          items: [],
          condicionPago: cot.condicionPago ?? cot.proveedor.condicionPago,
          condicionesPago: cot.condicionesPago,
          incluyeIgv: cot.incluyeIgv,
        });
      }
      byProveedor.get(cot.proveedorId)!.items.push(...selected);
    }

    // ── Fallback: cotización única aprobada (flujo anterior) ─────────────────
    if (byProveedor.size === 0) {
      const ganadora = solicitud.cotizaciones.find(
        (c) => c.estado === 'aprobada',
      );
      if (!ganadora)
        throw new BadRequestException(
          'No hay ítems adjudicados ni cotización aprobada',
        );
      byProveedor.set(ganadora.proveedorId, {
        proveedorId: ganadora.proveedorId,
        items: ganadora.items,
        condicionPago:
          ganadora.condicionPago ?? ganadora.proveedor.condicionPago,
        condicionesPago: ganadora.condicionesPago,
        incluyeIgv: ganadora.incluyeIgv,
      });
    }

    // Adelanto/saldo de la OC se alinean con la forma de pago que el proveedor
    // ya registró en su respuesta: si son exactamente 2 tramos, el primero
    // (por fecha) es el adelanto y el segundo el saldo. Con 1 o 3+ tramos no
    // hay un mapeo 2-columnas claro, así que se deja para edición manual
    // (el plan de pagos detallado igual queda registrado en `Pago`).
    function derivarAdelantoSaldo(
      condicionesPago: Cotizacion['condicionesPago'],
    ) {
      if (condicionesPago.length !== 2)
        return { adelantoPorcentaje: undefined, saldoPorcentaje: undefined };
      const [primero, segundo] = [...condicionesPago].sort(
        (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime(),
      );
      return {
        adelantoPorcentaje: primero.porcentaje,
        saldoPorcentaje: segundo.porcentaje,
      };
    }

    // Resolve lugarEntrega: explicit override > proyecto.direccion
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { id: proyectoId },
      select: { direccion: true },
    });
    const lugarEntrega = dto.lugarEntrega ?? proyecto?.direccion ?? undefined;

    const grupos = [...byProveedor.values()];
    const year = new Date().getFullYear();
    const baseCount = await this.prisma.ordenCompra.count({
      where: { creadoEn: { gte: new Date(`${year}-01-01`) } },
    });

    const ordenes = await this.prisma.$transaction(
      grupos.map((grupo, i) => {
        const monto = grupo.items.reduce(
          (s, item) => s + Number(item.precioUnit) * Number(item.cantidad),
          0,
        );
        const { adelantoPorcentaje, saldoPorcentaje } = derivarAdelantoSaldo(
          grupo.condicionesPago,
        );
        return this.prisma.ordenCompra.create({
          data: {
            numero: `OC-${year}-${String(baseCount + i + 1).padStart(4, '0')}`,
            nombre: solicitud.requerimiento?.nombre,
            solicitudId: dto.solicitudId,
            proveedorId: grupo.proveedorId,
            proyectoId,
            nota: dto.nota,
            condicionPago: grupo.condicionPago,
            incluyeIgv: grupo.incluyeIgv,
            adelantoPorcentaje,
            saldoPorcentaje,
            fechaEntrega: dto.fechaEntrega
              ? new Date(dto.fechaEntrega)
              : (solicitud.cotizaciones.find(
                  (c) => c.proveedorId === grupo.proveedorId,
                )?.fechaEntrega ?? undefined),
            lugarEntrega,
            montoTotal: monto,
            creadoPorId: userId,
            items: {
              create: grupo.items.map((item) => ({
                descripcion: item.descripcionProveedor,
                cantidad: item.cantidad,
                unidad: item.unidad,
                precioUnitario: item.precioUnit,
                precioTotal: Number(item.precioUnit) * Number(item.cantidad),
              })),
            },
            pagos: {
              create: grupo.condicionesPago.map((cp) => ({
                porcentaje: cp.porcentaje,
                monto: (monto * Number(cp.porcentaje)) / 100,
                fechaProgramada: cp.fecha,
                registradoPorId: userId,
              })),
            },
          },
          include: OC_INCLUDE,
        });
      }),
    );

    for (const oc of ordenes) {
      this.events.emit(AppEvents.ORDEN_COMPRA_GENERADA, {
        ordenCompraId: oc.id,
        numero: oc.numero,
        proveedorNombre: oc.proveedor.razonSocial,
      });
    }

    return ordenes;
  }

  async update(id: string, dto: UpdateOrdenCompraDto) {
    await this.findOne(id);
    return this.prisma.ordenCompra.update({
      where: { id },
      data: {
        nombre: dto.nombre,
        lugarEntrega: dto.lugarEntrega,
        nota: dto.nota,
        adelantoPorcentaje: dto.adelantoPorcentaje,
        saldoPorcentaje: dto.saldoPorcentaje,
        detraccionPorcentaje: dto.detraccionPorcentaje,
        incluyeIgv: dto.incluyeIgv,
        tipoCambio: dto.tipoCambio,
        contactoProveedorNombre: dto.contactoProveedorNombre,
        contactoProveedorTelefono: dto.contactoProveedorTelefono,
        condicionPago: dto.condicionPago,
        referencia: dto.referencia,
        concepto: dto.concepto,
        tiempoEntrega: dto.tiempoEntrega,
        contactoDycNombre: dto.contactoDycNombre,
        contactoDycArea: dto.contactoDycArea,
        contactoDycCelular: dto.contactoDycCelular,
        contactoDycTelefono: dto.contactoDycTelefono,
      },
      include: OC_INCLUDE,
    });
  }

  private assertItemsEditable(estado: EstadoOrdenCompra) {
    if (estado !== 'borrador' && estado !== 'emitida')
      throw new BadRequestException(
        `No se pueden modificar los ítems de una OC en estado "${estado}"`,
      );
  }

  private async recalcularMontoTotal(ordenId: string) {
    const items = await this.prisma.ordenCompraItem.findMany({
      where: { ordenId },
      select: { precioTotal: true },
    });
    const montoTotal = items.reduce((s, i) => s + Number(i.precioTotal), 0);
    await this.prisma.ordenCompra.update({
      where: { id: ordenId },
      data: { montoTotal },
    });
  }

  async addItem(ordenId: string, dto: CreateOrdenItemDto) {
    const oc = await this.findOne(ordenId);
    this.assertItemsEditable(oc.estado);

    await this.prisma.ordenCompraItem.create({
      data: {
        ordenId,
        codigo: dto.codigo,
        descripcion: dto.descripcion,
        cantidad: dto.cantidad,
        unidad: dto.unidad ?? 'und',
        precioUnitario: dto.precioUnitario,
        precioTotal: dto.cantidad * dto.precioUnitario,
      },
    });
    await this.recalcularMontoTotal(ordenId);
    return this.findOne(ordenId);
  }

  async updateItem(ordenId: string, itemId: string, dto: UpdateOrdenItemDto) {
    const oc = await this.findOne(ordenId);
    this.assertItemsEditable(oc.estado);

    const item = oc.items.find((i) => i.id === itemId);
    if (!item)
      throw new NotFoundException(`Ítem ${itemId} no encontrado en esta OC`);

    const cantidad = dto.cantidad ?? Number(item.cantidad);
    const precioUnitario = dto.precioUnitario ?? Number(item.precioUnitario);

    await this.prisma.ordenCompraItem.update({
      where: { id: itemId },
      data: {
        codigo: dto.codigo,
        descripcion: dto.descripcion,
        cantidad: dto.cantidad,
        unidad: dto.unidad,
        precioUnitario: dto.precioUnitario,
        precioTotal: cantidad * precioUnitario,
      },
    });
    await this.recalcularMontoTotal(ordenId);
    return this.findOne(ordenId);
  }

  async removeItem(ordenId: string, itemId: string) {
    const oc = await this.findOne(ordenId);
    this.assertItemsEditable(oc.estado);

    const item = oc.items.find((i) => i.id === itemId);
    if (!item)
      throw new NotFoundException(`Ítem ${itemId} no encontrado en esta OC`);
    if (oc.items.length === 1)
      throw new BadRequestException('La OC debe tener al menos un ítem');

    await this.prisma.ordenCompraItem.delete({ where: { id: itemId } });
    await this.recalcularMontoTotal(ordenId);
    return this.findOne(ordenId);
  }

  async transicionEstado(
    id: string,
    nuevoEstado: EstadoOrdenCompra,
    dto?: RecibirOrdenCompraDto,
  ) {
    const TRANSICIONES: Partial<
      Record<EstadoOrdenCompra, EstadoOrdenCompra[]>
    > = {
      borrador: ['emitida', 'cancelada'],
      emitida: ['recibida_parcial', 'recibida', 'cancelada'],
      recibida_parcial: ['recibida', 'cancelada'],
    };

    const oc = await this.findOne(id);
    const permitidos = TRANSICIONES[oc.estado] ?? [];
    if (!permitidos.includes(nuevoEstado))
      throw new BadRequestException(
        `No se puede pasar de "${oc.estado}" a "${nuevoEstado}"`,
      );

    if (nuevoEstado === 'emitida' && !oc.proveedor.ruc)
      throw new BadRequestException(
        `El proveedor "${oc.proveedor.razonSocial}" no tiene RUC registrado. Actualízalo antes de emitir la orden.`,
      );

    return this.prisma.ordenCompra.update({
      where: { id },
      data: {
        estado: nuevoEstado,
        fechaEmision: nuevoEstado === 'emitida' ? new Date() : undefined,
        ...(nuevoEstado === 'recibida' && {
          fechaEntregaReal: dto?.fechaEntregaReal
            ? new Date(dto.fechaEntregaReal)
            : new Date(),
          calificacionCalidad: dto?.calificacionCalidad,
        }),
      },
      include: OC_INCLUDE,
    });
  }

  private async generateNumero(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.ordenCompra.count({
      where: { creadoEn: { gte: new Date(`${year}-01-01`) } },
    });
    return `OC-${year}-${String(count + 1).padStart(4, '0')}`;
  }
}
