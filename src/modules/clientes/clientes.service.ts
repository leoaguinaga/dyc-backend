import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateClienteDto } from './dto/create-cliente.dto.js';
import { UpdateClienteDto } from './dto/update-cliente.dto.js';
import { CreateContactoDto } from './dto/create-contacto.dto.js';
import { UpdateContactoDto } from './dto/update-contacto.dto.js';

@Injectable()
export class ClientesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.cliente.findMany({
      orderBy: { razonSocial: 'asc' },
      include: {
        _count: { select: { proyectos: true, contactos: true } },
      },
    });
  }

  async findOne(id: string) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id },
      include: {
        contactos: { where: { activo: true }, orderBy: { nombre: 'asc' } },
        proyectos: {
          orderBy: { creadaEn: 'desc' },
          select: {
            id: true,
            codigo: true,
            nombre: true,
            estado: true,
            fechaInicio: true,
            fechaFin: true,
            coordinadorEmpresa: { select: { id: true, nombre: true, cargo: true } },
          },
        },
        _count: { select: { proyectos: true, contactos: true } },
      },
    });
    if (!cliente) throw new NotFoundException(`Cliente ${id} no encontrado`);
    return cliente;
  }

  create(dto: CreateClienteDto) {
    return this.prisma.cliente.create({ data: dto });
  }

  async update(id: string, dto: UpdateClienteDto) {
    await this.findOne(id);
    return this.prisma.cliente.update({ where: { id }, data: dto });
  }

  // --- Contactos ---

  findContactos(clienteId: string) {
    return this.prisma.contactoCliente.findMany({
      where: { clienteId },
      orderBy: { nombre: 'asc' },
    });
  }

  async createContacto(clienteId: string, dto: CreateContactoDto) {
    await this.findOne(clienteId);
    return this.prisma.contactoCliente.create({
      data: { ...dto, clienteId },
    });
  }

  async updateContacto(
    clienteId: string,
    contactoId: string,
    dto: UpdateContactoDto,
  ) {
    const contacto = await this.prisma.contactoCliente.findFirst({
      where: { id: contactoId, clienteId },
    });
    if (!contacto)
      throw new NotFoundException(`Contacto ${contactoId} no encontrado`);
    return this.prisma.contactoCliente.update({
      where: { id: contactoId },
      data: dto,
    });
  }
}
