import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Role } from '../../prisma/types.js';
import { CreateHelpVideoDto } from './dto/create-help-video.dto.js';
import { UpdateHelpVideoDto } from './dto/update-help-video.dto.js';

@Injectable()
export class AyudaService {
  constructor(private prisma: PrismaService) {}

  findAllForRole(role: Role) {
    return this.prisma.helpVideo.findMany({
      where: role === 'admin_ti' ? {} : { roles: { has: role } },
      orderBy: [{ modulo: 'asc' }, { orden: 'asc' }],
    });
  }

  async create(dto: CreateHelpVideoDto, creadoPorId: string) {
    return this.prisma.helpVideo.create({ data: { ...dto, creadoPorId } });
  }

  async update(id: string, dto: UpdateHelpVideoDto) {
    await this.findOneOrThrow(id);
    return this.prisma.helpVideo.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOneOrThrow(id);
    await this.prisma.helpVideo.delete({ where: { id } });
  }

  private async findOneOrThrow(id: string) {
    const video = await this.prisma.helpVideo.findUnique({ where: { id } });
    if (!video) throw new NotFoundException(`Video ${id} no encontrado`);
    return video;
  }
}
