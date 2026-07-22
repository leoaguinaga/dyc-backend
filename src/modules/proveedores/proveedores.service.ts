import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateProveedorDto } from './dto/create-proveedor.dto.js';
import { UpdateProveedorDto } from './dto/update-proveedor.dto.js';
import { QueryProveedorDto } from './dto/query-proveedor.dto.js';
import { CreateContactoProveedorDto } from './dto/create-contacto-proveedor.dto.js';
import { UpdateContactoProveedorDto } from './dto/update-contacto-proveedor.dto.js';
import {
  CreateCatalogoItemDto,
  UpdateCatalogoItemDto,
} from './dto/create-catalogo-item.dto.js';

@Injectable()
export class ProveedoresService {
  constructor(private prisma: PrismaService) {}

  findAll(query: QueryProveedorDto) {
    return this.prisma.proveedor.findMany({
      where: {
        activo: query.activo,
        departamento: query.departamento,
        razonSocial: query.nombre
          ? { contains: query.nombre, mode: 'insensitive' }
          : undefined,
      },
      orderBy: { razonSocial: 'asc' },
      include: {
        _count: { select: { contactos: true, cotizaciones: true } },
        contactos: {
          where: { activo: true, esPrincipal: true },
          take: 1,
          select: {
            id: true,
            nombre: true,
            cargo: true,
            telefono: true,
            email: true,
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const p = await this.prisma.proveedor.findUnique({
      where: { id },
      include: {
        contactos: { where: { activo: true }, orderBy: { nombre: 'asc' } },
      },
    });
    if (!p) throw new NotFoundException(`Proveedor ${id} no encontrado`);
    return p;
  }

  create(dto: CreateProveedorDto) {
    return this.prisma.proveedor.create({ data: dto });
  }

  async update(id: string, dto: UpdateProveedorDto) {
    await this.findOne(id);
    return this.prisma.proveedor.update({ where: { id }, data: dto });
  }

  // --- Contactos ---

  findContactos(proveedorId: string) {
    return this.prisma.contactoProveedor.findMany({
      where: { proveedorId },
      orderBy: { nombre: 'asc' },
    });
  }

  async createContacto(proveedorId: string, dto: CreateContactoProveedorDto) {
    await this.findOne(proveedorId);
    return this.prisma.contactoProveedor.create({
      data: { ...dto, proveedorId },
    });
  }

  async updateContacto(
    proveedorId: string,
    contactoId: string,
    dto: UpdateContactoProveedorDto,
  ) {
    const contacto = await this.prisma.contactoProveedor.findFirst({
      where: { id: contactoId, proveedorId },
    });
    if (!contacto)
      throw new NotFoundException(`Contacto ${contactoId} no encontrado`);
    return this.prisma.contactoProveedor.update({
      where: { id: contactoId },
      data: dto,
    });
  }

  async setPrincipalContacto(proveedorId: string, contactoId: string) {
    const contacto = await this.prisma.contactoProveedor.findFirst({
      where: { id: contactoId, proveedorId },
    });
    if (!contacto)
      throw new NotFoundException(`Contacto ${contactoId} no encontrado`);
    return this.prisma.$transaction([
      this.prisma.contactoProveedor.updateMany({
        where: { proveedorId },
        data: { esPrincipal: false },
      }),
      this.prisma.contactoProveedor.update({
        where: { id: contactoId },
        data: { esPrincipal: true },
      }),
    ]);
  }

  // --- Ítems solicitados (de cotizaciones) ---

  findItemsSolicitados(proveedorId: string) {
    return this.prisma.cotizacionItem.findMany({
      where: { cotizacion: { proveedorId } },
      include: {
        cotizacion: {
          select: {
            id: true,
            estado: true,
            solicitud: { select: { id: true, codigo: true } },
          },
        },
      },
      orderBy: { cotizacion: { creadoEn: 'desc' } },
    });
  }

  findCotizaciones(proveedorId: string) {
    return this.prisma.cotizacion.findMany({
      where: { proveedorId },
      include: {
        proveedor: { select: { id: true, razonSocial: true, ruc: true } },
        solicitud: { select: { id: true, codigo: true } },
        items: { include: { item: { select: { id: true, nombre: true } } } },
        condicionesPago: true,
        archivos: true,
      },
      orderBy: { creadoEn: 'desc' },
    });
  }

  // --- Evaluación (RF-P04) ---

  async evaluacion(proveedorId: string) {
    await this.findOne(proveedorId);

    // Precio competitivo: ítems ganados de este proveedor vs. el mínimo precio
    // ofertado por cualquier proveedor para el mismo ítem de la solicitud.
    const itemsSeleccionados = await this.prisma.cotizacionItem.findMany({
      where: {
        seleccionado: true,
        cotizacion: { proveedorId },
        solicitudItemId: { not: null },
      },
      select: { precioUnit: true, solicitudItemId: true },
    });

    let precioScore: number | null = null;
    if (itemsSeleccionados.length > 0) {
      const solicitudItemIds = itemsSeleccionados.map(
        (i) => i.solicitudItemId!,
      );
      const competidores = await this.prisma.cotizacionItem.findMany({
        where: { solicitudItemId: { in: solicitudItemIds } },
        select: { precioUnit: true, solicitudItemId: true },
      });
      const minPorItem = new Map<string, number>();
      for (const c of competidores) {
        const precio = Number(c.precioUnit);
        const actual = minPorItem.get(c.solicitudItemId!);
        if (actual === undefined || precio < actual)
          minPorItem.set(c.solicitudItemId!, precio);
      }
      const ratios = itemsSeleccionados.map((i) => {
        const min = minPorItem.get(i.solicitudItemId!) ?? Number(i.precioUnit);
        const propio = Number(i.precioUnit);
        return propio > 0 ? Math.min(min / propio, 1) : 1;
      });
      precioScore = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
    }

    const ordenesRecibidas = await this.prisma.ordenCompra.findMany({
      where: { proveedorId, estado: 'recibida' },
      select: {
        fechaEntrega: true,
        fechaEntregaReal: true,
        calificacionCalidad: true,
      },
    });

    // Cumplimiento de plazos: % de OCs entregadas en la fecha pactada o antes.
    const conPlazo = ordenesRecibidas.filter(
      (o) => o.fechaEntrega && o.fechaEntregaReal,
    );
    const plazosScore =
      conPlazo.length > 0
        ? conPlazo.filter((o) => o.fechaEntregaReal! <= o.fechaEntrega!)
            .length / conPlazo.length
        : null;

    // Calidad: promedio de calificaciones (1-5) normalizado a 0-1.
    const calificaciones = ordenesRecibidas
      .map((o) => o.calificacionCalidad)
      .filter((c): c is number => c !== null);
    const calidadScore =
      calificaciones.length > 0
        ? calificaciones.reduce((sum, c) => sum + c, 0) /
          calificaciones.length /
          5
        : null;

    const todosLosComponentes: { score: number | null; peso: number }[] = [
      { score: precioScore, peso: 0.4 },
      { score: plazosScore, peso: 0.3 },
      { score: calidadScore, peso: 0.3 },
    ];
    const componentes = todosLosComponentes.filter(
      (c): c is { score: number; peso: number } => c.score !== null,
    );

    const pesoTotal = componentes.reduce((sum, c) => sum + c.peso, 0);
    const puntajeTotal =
      pesoTotal > 0
        ? Math.round(
            (componentes.reduce((sum, c) => sum + c.score * c.peso, 0) /
              pesoTotal) *
              100,
          )
        : null;

    return {
      puntajeTotal,
      precioScore: precioScore !== null ? Math.round(precioScore * 100) : null,
      plazosScore: plazosScore !== null ? Math.round(plazosScore * 100) : null,
      calidadScore:
        calidadScore !== null ? Math.round(calidadScore * 100) : null,
      muestraCotizaciones: itemsSeleccionados.length,
      muestraOCs: ordenesRecibidas.length,
    };
  }

  async createCatalogoItem(proveedorId: string, dto: CreateCatalogoItemDto) {
    await this.findOne(proveedorId);
    return this.prisma.catalogoProductoProveedor.create({
      data: {
        proveedorId,
        descripcion: dto.descripcion,
        precioRef: dto.precioRef,
        unidad: dto.unidad ?? 'und',
        nota: dto.nota,
      },
    });
  }

  async updateCatalogoItem(
    proveedorId: string,
    itemId: string,
    dto: UpdateCatalogoItemDto,
  ) {
    const item = await this.prisma.catalogoProductoProveedor.findFirst({
      where: { id: itemId, proveedorId },
    });
    if (!item)
      throw new NotFoundException(`Ítem de catálogo ${itemId} no encontrado`);
    return this.prisma.catalogoProductoProveedor.update({
      where: { id: itemId },
      data: dto,
    });
  }

  async deleteCatalogoItem(proveedorId: string, itemId: string) {
    const item = await this.prisma.catalogoProductoProveedor.findFirst({
      where: { id: itemId, proveedorId },
    });
    if (!item)
      throw new NotFoundException(`Ítem de catálogo ${itemId} no encontrado`);
    return this.prisma.catalogoProductoProveedor.delete({
      where: { id: itemId },
    });
  }
}
