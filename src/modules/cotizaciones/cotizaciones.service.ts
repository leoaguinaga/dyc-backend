import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PrismaService } from '../../prisma/prisma.service.js';
import type { Role } from '../../prisma/types.js';
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

// Roles que representan al solicitante real (quien creó el requerimiento),
// distintos de los roles de gestión que ya podían operar este endpoint.
const SOLICITANTE_ROLES: Role[] = [
  'supervisor',
  'supervisor_civil',
  'supervisor_electrico',
  'pdr',
];

const SOLICITUD_INCLUDE = {
  proyecto: { select: { id: true, nombre: true, codigo: true } },
  aprobadaSolicitantePor: { select: { id: true, name: true, role: true } },
  aprobadaGerenciaPor: { select: { id: true, name: true, role: true } },
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
      creadoPor: { select: { id: true, name: true, role: true } },
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
        requerimiento: { select: { id: true, nombre: true } },
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

    if (dto.requerimientoId) {
      const req = await this.prisma.requerimiento.findUnique({
        where: { id: dto.requerimientoId },
        select: { id: true, codigo: true, nombre: true, creadoPorId: true, estado: true },
      });
      if (req?.estado === 'aprobado') {
        await this.prisma.requerimiento.update({
          where: { id: req.id },
          data: { estado: 'en_cotizacion' },
        });
        this.events.emit(AppEvents.REQUERIMIENTO_ESTADO_CAMBIADO, {
          requerimientoId: req.id,
          codigo: req.codigo,
          nombre: req.nombre,
          estado: 'en_cotizacion',
          creadoPorId: req.creadoPorId,
        });
      }
    }

    return solicitud;
  }

  async updateSolicitud(
    id: string,
    dto: UpdateSolicitudDto,
    actor: { id: string; role: Role },
  ) {
    const s = await this.findOneSolicitud(id);

    // No editable una vez generada la OC/OS (mientras siga activa) ni cancelada.
    // Si la OC se cancela, la solicitud vuelve a "aprobada_gerencia" (ver
    // OrdenesCompraService.transicionEstado) y vuelve a quedar editable aquí.
    if (s.estado === 'orden_generada' || s.estado === 'cancelada') {
      throw new BadRequestException(
        'No se puede editar la solicitud en su estado actual',
      );
    }

    // Una vez que gerencia aprobó, solo gerencia/administración puede seguir
    // editando (igual que el área técnica puede corregir un requerimiento
    // mientras decide) — logística ya no.
    if (
      s.estado === 'aprobada_gerencia' &&
      !['gerencia', 'administrador', 'admin_ti'].includes(actor.role)
    ) {
      throw new ForbiddenException(
        'Solo gerencia puede editar la solicitud una vez aprobada',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.solicitudItem.deleteMany({ where: { solicitudId: id } });
      }
      return tx.solicitudCotizacion.update({
        where: { id },
        data: {
          nota: dto.nota,
          estado: dto.estado,
          items: dto.items
            ? {
                create: dto.items.map((item) => ({
                  descripcion: item.descripcion,
                  unidad: (item.unidad as any) ?? 'und',
                  itemInventarioId: item.itemInventarioId ?? null,
                  cantidadTotal: item.cantidadTotal,
                  cantidadAlmacen: item.cantidadAlmacen ?? 0,
                  cantidadCompra:
                    item.cantidadTotal - (item.cantidadAlmacen ?? 0),
                })),
              }
            : undefined,
        },
        include: SOLICITUD_INCLUDE,
      });
    });
  }

  // ── Cotizaciones ─────────────────────────────────────────────────────────

  async inviteProveedor(
    solicitudId: string,
    dto: CreateCotizacionDto,
    actor: { id: string; role: Role },
  ) {
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
        creadoPorId: actor.id,
      },
      include: {
        proveedor: { select: { id: true, razonSocial: true, ruc: true } },
        creadoPor: { select: { id: true, name: true, role: true } },
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

  async receiveCotizacion(
    cotizacionId: string,
    dto: ReceiveCotizacionDto,
    actor: { id: string; role: Role },
  ) {
    const cotizacion = await this.prisma.cotizacion.findUnique({
      where: { id: cotizacionId },
      include: { solicitud: true },
    });
    if (!cotizacion)
      throw new NotFoundException(`Cotizacion ${cotizacionId} no encontrada`);

    const yaRespondida =
      cotizacion.estado === 'recibida' || cotizacion.estado === 'aprobada';
    if (
      cotizacion.estado !== 'pendiente' &&
      cotizacion.estado !== 'sin_respuesta' &&
      !yaRespondida
    ) {
      throw new BadRequestException(
        'Solo se pueden registrar o corregir respuestas de cotizaciones pendientes, recibidas o aprobadas',
      );
    }

    // Corregir una cotización ya recibida/aprobada sigue las mismas reglas que
    // editar la solicitud: no si ya se generó OC/OS, y solo gerencia una vez
    // que la solicitud fue aprobada por gerencia.
    if (yaRespondida) {
      if (
        cotizacion.solicitud.estado === 'orden_generada' ||
        cotizacion.solicitud.estado === 'cancelada'
      ) {
        throw new BadRequestException(
          'No se puede editar: ya se generó una orden de compra/servicio para esta solicitud',
        );
      }
      if (
        cotizacion.solicitud.estado === 'aprobada_gerencia' &&
        !['gerencia', 'administrador', 'admin_ti'].includes(actor.role)
      ) {
        throw new ForbiddenException(
          'Solo gerencia puede editar la cotización una vez aprobada',
        );
      }
    }

    const sumaPorcentajes = dto.condicionesPago.reduce(
      (s, c) => s + c.porcentaje,
      0,
    );
    if (Math.abs(sumaPorcentajes - 100) > 0.01)
      throw new BadRequestException(
        `Las condiciones de pago deben sumar 100% (actual: ${sumaPorcentajes.toFixed(2)}%)`,
      );

    // Al corregir una cotización ya aprobada no se debe "desaprobar": se
    // mantiene el estado y se conserva la selección de sus ítems (adjudicación)
    // para no romper el seguimiento del solicitante ni la generación de OC/OS.
    const nuevoEstadoCotizacion =
      cotizacion.estado === 'aprobada' ? 'aprobada' : 'recibida';

    const updated = await this.prisma.cotizacion.update({
      where: { id: cotizacionId },
      data: {
        estado: nuevoEstadoCotizacion,
        fechaRecibida: cotizacion.fechaRecibida ?? new Date(),
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
            seleccionado: nuevoEstadoCotizacion === 'aprobada',
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

    // Pasar solicitud a "cotizada" tras la primera respuesta — pero si ya
    // avanzó más allá (seleccionada/aprobada/...), una corrección posterior no
    // debe retroceder ese avance.
    const ESTADOS_PRE_COTIZADA: string[] = ['borrador', 'enviada', 'cotizada'];
    const yaEstabaCotizada = cotizacion.solicitud.estado === 'cotizada';
    if (ESTADOS_PRE_COTIZADA.includes(cotizacion.solicitud.estado)) {
      await this.prisma.solicitudCotizacion.update({
        where: { id: cotizacion.solicitudId },
        data: { estado: 'cotizada' },
      });
    }

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
    actor: { id: string; role: Role },
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

    // Si aprueba alguien con rol de solicitante (no logística/gerencia/admin
    // actuando por premura), debe ser quien generó el requerimiento original.
    if (nuevoEstado === 'aprobada_solicitante' && SOLICITANTE_ROLES.includes(actor.role)) {
      const requerimiento = s.requerimientoId
        ? await this.prisma.requerimiento.findUnique({
            where: { id: s.requerimientoId },
            select: { creadoPorId: true },
          })
        : null;
      if (!requerimiento || requerimiento.creadoPorId !== actor.id) {
        throw new ForbiddenException(
          'Solo el solicitante que generó este requerimiento puede aprobar la cotización',
        );
      }
    }

    const data: Record<string, unknown> = { estado: nuevoEstado };
    if (nuevoEstado === 'aprobada_solicitante') {
      data.aprobadaSolicitantePorId = actor.id;
      data.aprobadaSolicitantePorRole = actor.role;
      data.aprobadaSolicitanteEn = new Date();
    }
    if (nuevoEstado === 'aprobada_gerencia') {
      data.aprobadaGerenciaPorId = actor.id;
      data.aprobadaGerenciaPorRole = actor.role;
      data.aprobadaGerenciaEn = new Date();
    }

    return this.prisma.solicitudCotizacion.update({
      where: { id },
      data,
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
