import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuthService } from '../auth/auth.service.js';
import { CreateTrabajadorDto } from './dto/create-trabajador.dto.js';
import { UpdateTrabajadorDto } from './dto/update-trabajador.dto.js';
import { AsignarProyectoDto } from './dto/asignar-proyecto.dto.js';
import { CrearAccesoDto } from './dto/crear-acceso.dto.js';

@Injectable()
export class TrabajadoresService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  findAll() {
    return this.prisma.trabajador.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { nombre: 'asc' },
    });
  }

  async findOne(id: string) {
    const t = await this.prisma.trabajador.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        proyectos: { include: { proyecto: true } },
      },
    });
    if (!t) throw new NotFoundException(`Trabajador ${id} no encontrado`);
    return t;
  }

  async create(dto: CreateTrabajadorDto) {
    const { crearUsuario, role, password, ...trabajadorData } = dto;

    if (crearUsuario) {
      if (!trabajadorData.email)
        throw new BadRequestException(
          'Email requerido para crear acceso al sistema',
        );
      if (!role)
        throw new BadRequestException(
          'Rol requerido para crear acceso al sistema',
        );
      if (!password)
        throw new BadRequestException(
          'Contraseña requerida para crear acceso al sistema',
        );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const signUpEmail = this.authService.auth.api.signUpEmail as (opts: {
        body: { email: string; password: string; name: string };
      }) => Promise<{ user: { id: string } } | null>;
      const result = await signUpEmail({
        body: {
          email: trabajadorData.email,
          password,
          name: trabajadorData.nombre,
        },
      });
      if (!result?.user)
        throw new BadRequestException('Error al crear la cuenta de usuario');

      await this.prisma.user.update({
        where: { id: result.user.id },
        data: { role },
      });

      return this.prisma.trabajador.create({
        data: { ...trabajadorData, userId: result.user.id },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      });
    }

    return this.prisma.trabajador.create({ data: trabajadorData });
  }

  async update(id: string, dto: UpdateTrabajadorDto) {
    await this.assertExists(id);
    return this.prisma.trabajador.update({ where: { id }, data: dto });
  }

  async crearAcceso(id: string, dto: CrearAccesoDto) {
    const t = await this.findOne(id);
    if (t.userId)
      throw new BadRequestException(
        'Este trabajador ya tiene acceso al sistema',
      );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const signUpEmail = this.authService.auth.api.signUpEmail as (opts: {
      body: { email: string; password: string; name: string };
    }) => Promise<{ user: { id: string } } | null>;
    const result = await signUpEmail({
      body: { email: dto.email, password: dto.password, name: t.nombre },
    });
    if (!result?.user)
      throw new BadRequestException('Error al crear la cuenta de usuario');

    await this.prisma.user.update({
      where: { id: result.user.id },
      data: { role: dto.role },
    });

    return this.prisma.trabajador.update({
      where: { id },
      data: { userId: result.user.id },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });
  }

  async softDelete(id: string) {
    await this.assertExists(id);
    return this.prisma.trabajador.update({
      where: { id },
      data: { activo: false },
    });
  }

  async asignarProyecto(id: string, dto: AsignarProyectoDto) {
    await this.assertExists(id);
    return this.prisma.proyectoTrabajador.create({
      data: {
        trabajadorId: id,
        proyectoId: dto.proyectoId,
        fechaIngreso: new Date(dto.fechaIngreso),
        ...(dto.fechaSalida ? { fechaSalida: new Date(dto.fechaSalida) } : {}),
      },
    });
  }

  async desasignarProyecto(id: string, proyectoId: string) {
    return this.prisma.proyectoTrabajador.delete({
      where: { proyectoId_trabajadorId: { proyectoId, trabajadorId: id } },
    });
  }

  private async assertExists(id: string) {
    const t = await this.prisma.trabajador.findUnique({ where: { id } });
    if (!t) throw new NotFoundException(`Trabajador ${id} no encontrado`);
  }
}
