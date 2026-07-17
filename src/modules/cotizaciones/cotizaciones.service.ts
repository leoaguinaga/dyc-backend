import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateSolicitudDto } from './dto/create-solicitud.dto.js';
import { UpdateSolicitudDto } from './dto/update-solicitud.dto.js';
import {
  AdjudicarSolicitudDto,
  AttachArchivoDto,
  CreateCotizacionDto,
  ReceiveCotizacionDto,
} from './dto/create-cotizacion.dto.js';
import { QuerySolicitudDto } from './dto/query-solicitud.dto.js';
import { AppEvents } from '../../shared/events/events.js';
import { STORAGE_PROVIDER } from '../../shared/storage/storage.interface.js';
import type { StorageProvider } from '../../shared/storage/storage.interface.js';

const SOLICITUD_INCLUDE = {
  proyecto: { select: { id: true, nombre: true, codigo: true } },
  items: {
    include: {
      item: {
        select: { id: true, codigo: true, nombre: true, unidad: true },
      } satisfies object,
    },
  },
  cotizaciones: {
    include: {
      proveedor: { select: { id: true, razonSocial: true, ruc: true } },
      items: {
        include: {
          item: { select: { id: true, codigo: true, nombre: true } },
        },
      },
      condicionesPago: true,
    },
  },
} as const;

@Injectable()
export class CotizacionesService {
  constructor(
    private prisma: PrismaService,
    private events: EventEmitter2,
    @Inject(STORAGE_PROVIDER) private storage: StorageProvider,
  ) {}

  // ── Solicitudes ──────────────────────────────────────────────────────────

  findAllSolicitudes(query: QuerySolicitudDto) {
    return this.prisma.solicitudCotizacion.findMany({
      where: {
        estado: query.estado,
        proyectoId: query.proyectoId,
      },
      include: {
        proyecto: { select: { id: true, nombre: true, codigo: true } },
        _count: { select: { items: true, cotizaciones: true } },
      },
      orderBy: { creadoEn: 'desc' },
    });
  }

  async findOneSolicitud(id: string) {
    const s = await this.prisma.solicitudCotizacion.findUnique({
      where: { id },
      include: SOLICITUD_INCLUDE,
    });
    if (!s) throw new NotFoundException(`Solicitud ${id} no encontrada`);
    return s;
  }

  async createSolicitud(dto: CreateSolicitudDto) {
    // Derive proyectoId from requerimiento if not provided directly
    let proyectoId = dto.proyectoId;
    if (!proyectoId && dto.requerimientoId) {
      const req = await this.prisma.requerimiento.findUnique({
        where: { id: dto.requerimientoId },
        select: { proyectoId: true },
      });
      if (!req)
        throw new NotFoundException(
          `Requerimiento ${dto.requerimientoId} no encontrado`,
        );
      proyectoId = req.proyectoId;
    }
    if (!proyectoId)
      throw new BadRequestException('Se requiere proyectoId o requerimientoId');

    const codigo = await this.generateCodigo();
    const tieneProveedores = dto.proveedorIds && dto.proveedorIds.length > 0;

    const solicitud = await this.prisma.solicitudCotizacion.create({
      data: {
        codigo,
        proyectoId,
        requerimientoId: dto.requerimientoId,
        nota: dto.nota,
        estado: tieneProveedores ? 'enviada' : 'borrador',
        items: {
          create: dto.items.map((item) => ({
            descripcion: item.descripcion,
            unidad: (item.unidad as any) ?? 'und',
            itemInventarioId: item.itemInventarioId ?? null,
            cantidadTotal: item.cantidadTotal,
            cantidadAlmacen: item.cantidadAlmacen ?? 0,
            cantidadCompra: item.cantidadTotal - (item.cantidadAlmacen ?? 0),
          })),
        },
        ...(tieneProveedores && {
          cotizaciones: {
            create: dto.proveedorIds!.map((proveedorId) => ({ proveedorId })),
          },
        }),
      },
      include: SOLICITUD_INCLUDE,
    });

    return solicitud;
  }

  async updateSolicitud(id: string, dto: UpdateSolicitudDto) {
    await this.findOneSolicitud(id);
    return this.prisma.solicitudCotizacion.update({
      where: { id },
      data: dto,
      include: SOLICITUD_INCLUDE,
    });
  }

  // ── Cotizaciones ─────────────────────────────────────────────────────────

  async inviteProveedor(solicitudId: string, dto: CreateCotizacionDto) {
    const solicitud = await this.findOneSolicitud(solicitudId);

    const yaInvitado = solicitud.cotizaciones.some(
      (c) => c.proveedorId === dto.proveedorId,
    );
    if (yaInvitado) {
      throw new BadRequestException(
        'El proveedor ya fue invitado a esta solicitud',
      );
    }

    const cotizacion = await this.prisma.cotizacion.create({
      data: {
        solicitudId,
        proveedorId: dto.proveedorId,
        nota: dto.nota,
      },
      include: {
        proveedor: { select: { id: true, razonSocial: true, ruc: true } },
      },
    });

    // Pasar solicitud a "enviada" si estaba en borrador
    if (solicitud.estado === 'borrador') {
      await this.prisma.solicitudCotizacion.update({
        where: { id: solicitudId },
        data: { estado: 'enviada' },
      });
    }

    return cotizacion;
  }

  async receiveCotizacion(cotizacionId: string, dto: ReceiveCotizacionDto) {
    const cotizacion = await this.prisma.cotizacion.findUnique({
      where: { id: cotizacionId },
      include: { solicitud: true },
    });
    if (!cotizacion)
      throw new NotFoundException(`Cotizacion ${cotizacionId} no encontrada`);
    if (
      cotizacion.estado !== 'pendiente' &&
      cotizacion.estado !== 'sin_respuesta'
    ) {
      throw new BadRequestException(
        'Solo se pueden registrar respuestas en cotizaciones pendientes o marcadas como sin respuesta',
      );
    }

    const sumaPorcentajes = dto.condicionesPago.reduce(
      (s, c) => s + c.porcentaje,
      0,
    );
    if (Math.abs(sumaPorcentajes - 100) > 0.01)
      throw new BadRequestException(
        `Las condiciones de pago deben sumar 100% (actual: ${sumaPorcentajes.toFixed(2)}%)`,
      );

    const updated = await this.prisma.cotizacion.update({
      where: { id: cotizacionId },
      data: {
        estado: 'recibida',
        fechaRecibida: new Date(),
        fechaEntrega: dto.fechaEntrega ? new Date(dto.fechaEntrega) : undefined,
        validezDias: dto.validezDias,
        condicionesServicio: dto.condicionesServicio,
        condicionPago: dto.condicionPago,
        incluyeIgv: dto.incluyeIgv ?? false,
        nota: dto.nota,
        items: {
          deleteMany: {},
          create: dto.items.map((item) => ({
            descripcionProveedor: item.descripcionProveedor,
            itemInventarioId: item.itemInventarioId,
            solicitudItemId: item.solicitudItemId,
            precioUnit: item.precioUnit,
            cantidad: item.cantidad,
            unidad: item.unidad,
          })),
        },
        condicionesPago: {
          deleteMany: {},
          create: dto.condicionesPago.map((cp) => ({
            porcentaje: cp.porcentaje,
            fecha: new Date(cp.fecha),
          })),
        },
      },
      include: {
        proveedor: { select: { id: true, razonSocial: true, ruc: true } },
        items: { include: { item: { select: { id: true, nombre: true } } } },
        condicionesPago: true,
        archivos: true,
      },
    });

    // Pasar solicitud a "cotizada" si al menos una cotización fue recibida
    const yaEstabaCotizada = cotizacion.solicitud.estado === 'cotizada';
    await this.prisma.solicitudCotizacion.update({
      where: { id: cotizacion.solicitudId },
      data: { estado: 'cotizada' },
    });

    this.events.emit(AppEvents.COTIZACION_RECIBIDA, {
      solicitudId: cotizacion.solicitudId,
      solicitudCodigo: cotizacion.solicitud.codigo,
      proveedorNombre: updated.proveedor.razonSocial,
    });
    if (!yaEstabaCotizada) {
      this.events.emit(AppEvents.COTIZACION_ESTADO_CAMBIADO, {
        solicitudId: cotizacion.solicitudId,
        solicitudCodigo: cotizacion.solicitud.codigo,
        estado: 'cotizada',
      });
    }

    return updated;
  }

  async aprobarCotizacion(cotizacionId: string) {
    const cotizacion = await this.prisma.cotizacion.findUnique({
      where: { id: cotizacionId },
      include: { solicitud: true },
    });
    if (!cotizacion)
      throw new NotFoundException(`Cotizacion ${cotizacionId} no encontrada`);
    if (cotizacion.estado !== 'recibida') {
      throw new BadRequestException(
        'Solo se pueden aprobar cotizaciones recibidas',
      );
    }

    // Aprobar esta, rechazar las demás de la misma solicitud
    await this.prisma.$transaction([
      this.prisma.cotizacion.update({
        where: { id: cotizacionId },
        data: { estado: 'aprobada' },
      }),
      this.prisma.cotizacion.updateMany({
        where: {
          solicitudId: cotizacion.solicitudId,
          id: { not: cotizacionId },
          estado: 'recibida',
        },
        data: { estado: 'rechazada' },
      }),
      // Marcar todos los ítems de la cotización ganadora como seleccionados
      // (y desmarcar los de cualquier otra cotización de la misma solicitud),
      // igual que hace adjudicarSolicitud() para el flujo de split-award.
      this.prisma.cotizacionItem.updateMany({
        where: { cotizacion: { solicitudId: cotizacion.solicitudId } },
        data: { seleccionado: false },
      }),
      this.prisma.cotizacionItem.updateMany({
        where: { cotizacionId },
        data: { seleccionado: true },
      }),
      this.prisma.solicitudCotizacion.update({
        where: { id: cotizacion.solicitudId },
        data: { estado: 'seleccionada' },
      }),
    ]);

    return this.prisma.cotizacion.findUnique({
      where: { id: cotizacionId },
      include: {
        proveedor: { select: { id: true, razonSocial: true, ruc: true } },
        items: true,
      },
    });
  }

  async marcarSinRespuesta(cotizacionId: string) {
    const cotizacion = await this.prisma.cotizacion.findUnique({
      where: { id: cotizacionId },
    });
    if (!cotizacion)
      throw new NotFoundException(`Cotizacion ${cotizacionId} no encontrada`);
    if (cotizacion.estado !== 'pendiente') {
      throw new BadRequestException(
        'Solo se pueden marcar como "sin respuesta" las cotizaciones pendientes',
      );
    }

    return this.prisma.cotizacion.update({
      where: { id: cotizacionId },
      data: { estado: 'sin_respuesta' },
      include: {
        proveedor: { select: { id: true, razonSocial: true, ruc: true } },
        items: true,
      },
    });
  }

  async avanzarEstadoSolicitud(
    id: string,
    nuevoEstado: 'aprobada_solicitante' | 'aprobada_gerencia' | 'cancelada',
  ) {
    const TRANSICIONES: Partial<Record<string, (typeof nuevoEstado)[]>> = {
      seleccionada: ['aprobada_solicitante', 'cancelada'],
      aprobada_solicitante: ['aprobada_gerencia', 'cancelada'],
    };

    const s = await this.findOneSolicitud(id);
    const permitidos = TRANSICIONES[s.estado] ?? [];
    if (!permitidos.includes(nuevoEstado))
      throw new BadRequestException(
        `No se puede pasar de "${s.estado}" a "${nuevoEstado}"`,
      );

    return this.prisma.solicitudCotizacion.update({
      where: { id },
      data: { estado: nuevoEstado },
      include: SOLICITUD_INCLUDE,
    });
  }

  async adjudicarSolicitud(solicitudId: string, dto: AdjudicarSolicitudDto) {
    const solicitud = await this.findOneSolicitud(solicitudId);

    if (solicitud.estado !== 'cotizada')
      throw new BadRequestException(
        'Solo se puede adjudicar en estado "cotizada"',
      );

    const solicitudItemIds = new Set(solicitud.items.map((i) => i.id));
    const coveredIds = new Set(
      dto.adjudicaciones.map((a) => a.solicitudItemId),
    );
    const uncovered = [...solicitudItemIds].filter((id) => !coveredIds.has(id));
    if (uncovered.length > 0)
      throw new BadRequestException(
        `${uncovered.length} ítem(s) sin proveedor asignado`,
      );

    const allCotizacionItemIds = new Set(
      solicitud.cotizaciones.flatMap((c) => c.items.map((i) => i.id)),
    );
    const selectedIds = dto.adjudicaciones.map((a) => a.cotizacionItemId);
    const invalid = selectedIds.filter((id) => !allCotizacionItemIds.has(id));
    if (invalid.length > 0)
      throw new BadRequestException(
        'Items de cotización no pertenecen a esta solicitud',
      );

    const winningCotizacionIds = new Set(
      solicitud.cotizaciones
        .filter((c) => c.items.some((i) => selectedIds.includes(i.id)))
        .map((c) => c.id),
    );

    await this.prisma.$transaction([
      this.prisma.cotizacionItem.updateMany({
        where: {
          cotizacionId: { in: solicitud.cotizaciones.map((c) => c.id) },
        },
        data: { seleccionado: false },
      }),
      this.prisma.cotizacionItem.updateMany({
        where: { id: { in: selectedIds } },
        data: { seleccionado: true },
      }),
      ...solicitud.cotizaciones.map((c) =>
        this.prisma.cotizacion.update({
          where: { id: c.id },
          data: {
            estado: winningCotizacionIds.has(c.id) ? 'aprobada' : 'rechazada',
          },
        }),
      ),
      this.prisma.solicitudCotizacion.update({
        where: { id: solicitudId },
        data: { estado: 'seleccionada' },
      }),
    ]);

    return this.findOneSolicitud(solicitudId);
  }

  // ── Archivos ─────────────────────────────────────────────────────────────

  subirArchivo(file: Express.Multer.File) {
    return this.storage.save({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      folder: 'cotizaciones',
    });
  }

  async attachArchivo(cotizacionId: string, dto: AttachArchivoDto) {
    const cotizacion = await this.prisma.cotizacion.findUnique({
      where: { id: cotizacionId },
    });
    if (!cotizacion)
      throw new NotFoundException(`Cotizacion ${cotizacionId} no encontrada`);

    return this.prisma.cotizacionArchivo.create({
      data: { cotizacionId, nombre: dto.nombre, url: dto.url },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async generateCodigo(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.solicitudCotizacion.count({
      where: { creadoEn: { gte: new Date(`${year}-01-01`) } },
    });
    return `SC-${year}-${String(count + 1).padStart(3, '0')}`;
  }
}
