import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateAlmacenDto } from './dto/create-almacen.dto.js';

@Injectable()
export class AlmacenesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.almacen.findMany({
      orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
    });
  }

  async findOne(id: string) {
    const almacen = await this.prisma.almacen.findUnique({ where: { id } });
    if (!almacen) throw new NotFoundException(`Almacén ${id} no encontrado`);
    return almacen;
  }

  create(dto: CreateAlmacenDto) {
    return this.prisma.almacen.create({
      data: {
        nombre: dto.nombre,
        tipo: dto.tipo ?? 'fijo',
        ciudad: dto.ciudad,
        notas: dto.notas,
      },
    });
  }

  async update(id: string, dto: Partial<CreateAlmacenDto>) {
    await this.findOne(id);
    return this.prisma.almacen.update({ where: { id }, data: dto });
  }
}
