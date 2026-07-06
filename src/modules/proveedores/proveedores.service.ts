import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateProveedorDto } from './dto/create-proveedor.dto.js';
import { UpdateProveedorDto } from './dto/update-proveedor.dto.js';
import { QueryProveedorDto } from './dto/query-proveedor.dto.js';
import { CreateContactoProveedorDto } from './dto/create-contacto-proveedor.dto.js';
import { UpdateContactoProveedorDto } from './dto/update-contacto-proveedor.dto.js';
import { CreateCatalogoItemDto, UpdateCatalogoItemDto } from './dto/create-catalogo-item.dto.js';

@Injectable()
export class ProveedoresService {
  constructor(private prisma: PrismaService) {}

  findAll(query: QueryProveedorDto) {
    return this.prisma.proveedor.findMany({
      where: {
        activo: query.activo,
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
          select: { id: true, nombre: true, cargo: true, telefono: true, email: true },
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
    return this.prisma.catalogoProductoProveedor.delete({ where: { id: itemId } });
  }
}
