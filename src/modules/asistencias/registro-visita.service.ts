import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateRegistroVisitaDto } from './dto/create-registro-visita.dto.js';
import { hoyLima, soloFechaUTC } from '../../shared/date/fecha.util.js';

const CARGOS_OPERARIO = ['Operario', 'Técnico'];

@Injectable()
export class RegistroVisitaService {
  constructor(private prisma: PrismaService) {}

  listar(proyectoId: string, fecha?: string) {
    return this.prisma.registroVisita.findMany({
      where: {
        proyectoId,
        fecha: fecha ? this.soloFecha(new Date(fecha)) : this.hoy(),
      },
      orderBy: { horaEntrada: 'desc' },
      include: {
        trabajador: {
          select: { id: true, nombre: true, dni: true, cargo: true },
        },
        user: { select: { id: true, name: true, role: true } },
        registradoPor: { select: { id: true, name: true } },
      },
    });
  }

  async registrarEntrada(
    proyectoId: string,
    actorId: string,
    dto: CreateRegistroVisitaDto,
  ) {
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { id: proyectoId },
    });
    if (!proyecto)
      throw new NotFoundException(`Obra ${proyectoId} no encontrada`);

    if (dto.tipo === 'staff') {
      if (!dto.trabajadorId) {
        throw new BadRequestException(
          'Staff requiere trabajadorId (debe estar asignado a la obra)',
        );
      }
      const asignacion = await this.prisma.proyectoTrabajador.findFirst({
        where: {
          proyectoId,
          trabajadorId: dto.trabajadorId,
          OR: [{ fechaSalida: null }, { fechaSalida: { gte: new Date() } }],
        },
        include: { trabajador: { select: { cargo: true } } },
      });
      if (!asignacion) {
        throw new BadRequestException(
          'El trabajador no está asignado a esta obra',
        );
      }
      if (
        asignacion.trabajador.cargo &&
        CARGOS_OPERARIO.includes(asignacion.trabajador.cargo)
      ) {
        throw new BadRequestException(
          'Los operarios se registran con Asistencia (turno), no con este flujo',
        );
      }
    } else {
      if (!dto.trabajadorId && !dto.userId && !dto.nombreLibre) {
        throw new BadRequestException(
          'Staff de oficina requiere trabajadorId, userId o nombreLibre',
        );
      }
      if (!dto.motivo) {
        throw new BadRequestException(
          'Staff de oficina requiere motivo de la visita',
        );
      }
    }

    return this.prisma.registroVisita.create({
      data: {
        proyectoId,
        fecha: this.hoy(),
        tipo: dto.tipo,
        trabajadorId: dto.trabajadorId,
        userId: dto.userId,
        nombreLibre: dto.nombreLibre,
        motivo: dto.motivo,
        horaEntrada: new Date(),
        registradoPorId: actorId,
      },
    });
  }

  async marcarSalida(proyectoId: string, registroId: string) {
    const registro = await this.prisma.registroVisita.findFirst({
      where: { id: registroId, proyectoId },
    });
    if (!registro)
      throw new NotFoundException(`Registro ${registroId} no encontrado`);
    if (registro.horaSalida) {
      throw new BadRequestException('Ya se registró la salida');
    }

    return this.prisma.registroVisita.update({
      where: { id: registroId },
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
