import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../prisma/generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateTurnoConfigDto } from './dto/create-turno-config.dto.js';
import { UpdateTurnoConfigDto } from './dto/update-turno-config.dto.js';

function cruzaMedianoche(horaInicio: string, horaFin: string): boolean {
  return horaFin <= horaInicio;
}

@Injectable()
export class TurnoConfigsService {
  constructor(private prisma: PrismaService) {}

  async findAll(proyectoId: string) {
    await this.assertProyectoExiste(proyectoId);
    return this.prisma.turnoConfig.findMany({
      where: { proyectoId },
      orderBy: { horaInicio: 'asc' },
    });
  }

  async findOne(proyectoId: string, turnoConfigId: string) {
    const turnoConfig = await this.prisma.turnoConfig.findFirst({
      where: { id: turnoConfigId, proyectoId },
    });
    if (!turnoConfig) {
      throw new NotFoundException(
        `Turno de horario ${turnoConfigId} no encontrado`,
      );
    }
    return turnoConfig;
  }

  async create(proyectoId: string, dto: CreateTurnoConfigDto) {
    await this.assertProyectoExiste(proyectoId);

    try {
      return await this.prisma.turnoConfig.create({
        data: {
          proyectoId,
          nombre: dto.nombre,
          horaInicio: dto.horaInicio,
          horaFin: dto.horaFin,
          cruzaMedianoche: cruzaMedianoche(dto.horaInicio, dto.horaFin),
          toleranciaMinutos: dto.toleranciaMinutos ?? 10,
          toleranciaSalidaMinutos: dto.toleranciaSalidaMinutos ?? 60,
        },
      });
    } catch (e) {
      throw this.mapUniqueError(e, dto.nombre);
    }
  }

  async update(
    proyectoId: string,
    turnoConfigId: string,
    dto: UpdateTurnoConfigDto,
  ) {
    const turnoConfig = await this.findOne(proyectoId, turnoConfigId);

    const horaInicio = dto.horaInicio ?? turnoConfig.horaInicio;
    const horaFin = dto.horaFin ?? turnoConfig.horaFin;

    try {
      return await this.prisma.turnoConfig.update({
        where: { id: turnoConfigId },
        data: {
          nombre: dto.nombre,
          horaInicio: dto.horaInicio,
          horaFin: dto.horaFin,
          cruzaMedianoche:
            dto.horaInicio || dto.horaFin
              ? cruzaMedianoche(horaInicio, horaFin)
              : undefined,
          toleranciaMinutos: dto.toleranciaMinutos,
          toleranciaSalidaMinutos: dto.toleranciaSalidaMinutos,
          activo: dto.activo,
        },
      });
    } catch (e) {
      throw this.mapUniqueError(e, dto.nombre ?? turnoConfig.nombre);
    }
  }

  async desactivar(proyectoId: string, turnoConfigId: string) {
    await this.findOne(proyectoId, turnoConfigId);
    return this.prisma.turnoConfig.update({
      where: { id: turnoConfigId },
      data: { activo: false },
    });
  }

  private async assertProyectoExiste(proyectoId: string) {
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { id: proyectoId },
      select: { id: true },
    });
    if (!proyecto) {
      throw new NotFoundException(`Obra ${proyectoId} no encontrada`);
    }
  }

  private mapUniqueError(e: unknown, nombre: string) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002'
    ) {
      return new BadRequestException(
        `Ya existe un turno llamado "${nombre}" en esta obra`,
      );
    }
    return e;
  }
}
