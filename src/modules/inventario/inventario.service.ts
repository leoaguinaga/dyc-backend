import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateItemDto } from './dto/create-item.dto.js';
import { UpdateItemDto } from './dto/update-item.dto.js';
import { QueryItemDto } from './dto/query-item.dto.js';

@Injectable()
export class InventarioService {
  constructor(private prisma: PrismaService) {}

  findAll(query: QueryItemDto) {
    return this.prisma.itemInventario.findMany({
      where: {
        activo: query.activo,
        categoria: query.categoria,
        tipo: query.tipo,
        ...(query.q && {
          OR: [
            { nombre: { contains: query.q, mode: 'insensitive' } },
            { codigo: { contains: query.q, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { nombre: 'asc' },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.itemInventario.findUnique({ where: { id } });
    if (!item) throw new NotFoundException(`Ítem ${id} no encontrado`);
    return item;
  }

  async create(dto: CreateItemDto) {
    const existe = await this.prisma.itemInventario.findUnique({
      where: { codigo: dto.codigo },
    });
    if (existe)
      throw new ConflictException(`El código ${dto.codigo} ya existe`);
    return this.prisma.itemInventario.create({ data: dto });
  }

  async update(id: string, dto: UpdateItemDto) {
    await this.findOne(id);
    if (dto.codigo) {
      const existe = await this.prisma.itemInventario.findFirst({
        where: { codigo: dto.codigo, NOT: { id } },
      });
      if (existe)
        throw new ConflictException(`El código ${dto.codigo} ya existe`);
    }
    return this.prisma.itemInventario.update({ where: { id }, data: dto });
  }
}
