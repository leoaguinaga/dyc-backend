import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateVisitaTerceroDto } from './dto/create-visita-tercero.dto.js';
import { hoyLima, soloFechaUTC } from '../../shared/date/fecha.util.js';

@Injectable()
export class VisitaTerceroService {
  constructor(private prisma: PrismaService) {}

  listar(proyectoId: string, fecha?: string) {
    return this.prisma.visitaTercero.findMany({
      where: {
        proyectoId,
        fecha: fecha ? this.soloFecha(new Date(fecha)) : this.hoy(),
      },
      orderBy: { creadoEn: 'desc' },
      include: {
        visitantes: true,
        registradoPor: { select: { id: true, name: true } },
      },
    });
  }

  async registrar(
    proyectoId: string,
    actorId: string,
    dto: CreateVisitaTerceroDto,
  ) {
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { id: proyectoId },
    });
    if (!proyecto)
      throw new NotFoundException(`Obra ${proyectoId} no encontrada`);

    const horaEntrada = new Date();

    return this.prisma.visitaTercero.create({
      data: {
        proyectoId,
        fecha: this.hoy(),
        empresaNombre: dto.empresaNombre,
        motivo: dto.motivo,
        registradoPorId: actorId,
        visitantes: {
          create: dto.visitantes.map((v) => ({
            nombre: v.nombre,
            dni: v.dni,
            horaEntrada,
          })),
        },
      },
      include: { visitantes: true },
    });
  }

  async marcarSalidaVisitante(
    proyectoId: string,
    visitaId: string,
    visitanteId: string,
  ) {
    const visitante = await this.prisma.visitanteTercero.findFirst({
      where: {
        id: visitanteId,
        visitaTerceroId: visitaId,
        visitaTercero: { proyectoId },
      },
    });
    if (!visitante)
      throw new NotFoundException(`Visitante ${visitanteId} no encontrado`);
    if (visitante.horaSalida) {
      throw new BadRequestException('Ya se registró la salida');
    }

    return this.prisma.visitanteTercero.update({
      where: { id: visitanteId },
      data: { horaSalida: new Date() },
    });
  }

  private hoy(): Date {
    return hoyLima();
  }

  private soloFecha(d: Date): Date {
    return soloFechaUTC(d);
  }
}
