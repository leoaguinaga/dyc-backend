import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuthService } from '../auth/auth.service.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        trabajador: { select: { cargo: true } },
      },
    });
    if (!user) throw new NotFoundException(`Usuario ${id} no encontrado`);
    const { trabajador, ...rest } = user;
    return { ...rest, cargo: trabajador?.cargo ?? null };
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    return this.prisma.user.update({ where: { id }, data: dto });
  }

  // El usuario ya está autenticado (sesión válida vía AuthGuard), así que se
  // omite la verificación de la contraseña actual que exige better-auth's
  // changePassword — la sesión activa ya es suficiente prueba de identidad.
  async changeOwnPassword(userId: string, newPassword: string) {
    const ctx = await this.authService.auth.$context;
    const accounts = await ctx.internalAdapter.findAccounts(userId);
    const account = accounts.find(
      (a: { providerId: string; password?: string | null }) =>
        a.providerId === 'credential' && a.password,
    );
    if (!account) throw new BadRequestException('Cuenta de credenciales no encontrada');

    const passwordHash = await ctx.password.hash(newPassword);
    await ctx.internalAdapter.updateAccount(account.id, { password: passwordHash });
  }
}
