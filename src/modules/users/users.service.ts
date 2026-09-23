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

  async findActivity(id: string) {
    await this.findOne(id);

    const [user, counts, trabajador] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id },
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      }),
      this.prisma.user.findUniqueOrThrow({
        where: { id },
        select: {
          _count: {
            select: {
              requerimientos: true,
              requerimientosRecepcionados: true,
              ordenesCompra: true,
              ordenesCompraAprobadas: true,
              comprasSimplesCreadas: true,
              comprasSimplesAprobadasInformalmente: true,
              pagosRegistrados: true,
              pagosEjecutados: true,
              comprobantesGenerados: true,
              pagosRecurrentesCreados: true,
              cobrosRegistrados: true,
              cobrosMarcados: true,
              notificaciones: true,
              turnosAbiertos: true,
              turnosCerrados: true,
              turnosCorregidos: true,
              registrosVisitaComoVisitante: true,
              registrosVisitaRegistradosPor: true,
              visitasTerceroRegistradas: true,
              planillasGeneradas: true,
              planillasStaffGeneradas: true,
              compraSimpleArchivosSubidos: true,
              helpVideosCreados: true,
              solicitudesCotizacionAprobadasComoSolicitante: true,
              solicitudesCotizacionAprobadasComoGerencia: true,
              cotizacionesCreadas: true,
              proyectosComoSupervisor: true,
            },
          },
        },
      }),
      this.prisma.trabajador.findUnique({
        where: { userId: id },
        select: {
          id: true,
          nombre: true,
          cargo: true,
          activo: true,
          asistencias: {
            take: 20,
            orderBy: { turno: { fecha: 'desc' } },
            select: {
              id: true,
              estado: true,
              horasNormales: true,
              horasExtra: true,
              turno: { select: { fecha: true, proyecto: { select: { nombre: true } } } },
            },
          },
        },
      }),
    ]);

    const recientes = await this.recentActions(id);

    return { user, counts: counts._count, trabajador, actividadReciente: recientes };
  }

  private async recentActions(userId: string) {
    const [
      requerimientos,
      comprasSimples,
      ordenesCompra,
      pagosRegistrados,
      pagosEjecutados,
      cobrosRegistrados,
      comprobantes,
      turnosAbiertos,
      turnosCerrados,
      planillas,
    ] = await Promise.all([
      this.prisma.requerimiento.findMany({
        where: { creadoPorId: userId },
        take: 5,
        orderBy: { creadoEn: 'desc' },
        select: { id: true, codigo: true, nombre: true, creadoEn: true },
      }),
      this.prisma.compraSimple.findMany({
        where: { creadoPorId: userId },
        take: 5,
        orderBy: { creadoEn: 'desc' },
        select: { id: true, codigo: true, nombre: true, creadoEn: true },
      }),
      this.prisma.ordenCompra.findMany({
        where: { creadoPorId: userId },
        take: 5,
        orderBy: { creadoEn: 'desc' },
        select: { id: true, numero: true, creadoEn: true },
      }),
      this.prisma.pago.findMany({
        where: { registradoPorId: userId },
        take: 5,
        orderBy: { creadoEn: 'desc' },
        select: { id: true, concepto: true, creadoEn: true },
      }),
      this.prisma.pago.findMany({
        where: { pagadoPorId: userId },
        take: 5,
        orderBy: { creadoEn: 'desc' },
        select: { id: true, concepto: true, creadoEn: true },
      }),
      this.prisma.cobro.findMany({
        where: { registradoPorId: userId },
        take: 5,
        orderBy: { creadoEn: 'desc' },
        select: { id: true, creadoEn: true, proyecto: { select: { nombre: true } } },
      }),
      this.prisma.comprobante.findMany({
        where: { generadoPorId: userId },
        take: 5,
        orderBy: { creadoEn: 'desc' },
        select: { id: true, numero: true, creadoEn: true },
      }),
      this.prisma.turno.findMany({
        where: { abiertoPorId: userId },
        take: 5,
        orderBy: { creadoEn: 'desc' },
        select: { id: true, creadoEn: true, proyecto: { select: { nombre: true } } },
      }),
      this.prisma.turno.findMany({
        where: { cerradoPorId: userId },
        take: 5,
        orderBy: { creadoEn: 'desc' },
        select: { id: true, creadoEn: true, proyecto: { select: { nombre: true } } },
      }),
      this.prisma.planilla.findMany({
        where: { generadaPorId: userId },
        take: 5,
        orderBy: { generadaEn: 'desc' },
        select: { id: true, generadaEn: true, proyecto: { select: { nombre: true } } },
      }),
    ]);

    const items = [
      ...requerimientos.map((r) => ({
        tipo: 'requerimiento' as const,
        id: r.id,
        etiqueta: `Creó requerimiento ${r.codigo} — ${r.nombre}`,
        fecha: r.creadoEn,
      })),
      ...comprasSimples.map((c) => ({
        tipo: 'compra_simple' as const,
        id: c.id,
        etiqueta: `Creó compra simple ${c.codigo} — ${c.nombre}`,
        fecha: c.creadoEn,
      })),
      ...ordenesCompra.map((o) => ({
        tipo: 'orden_compra' as const,
        id: o.id,
        etiqueta: `Creó orden de compra ${o.numero}`,
        fecha: o.creadoEn,
      })),
      ...pagosRegistrados.map((p) => ({
        tipo: 'pago_registrado' as const,
        id: p.id,
        etiqueta: `Registró pago${p.concepto ? ` — ${p.concepto}` : ''}`,
        fecha: p.creadoEn,
      })),
      ...pagosEjecutados.map((p) => ({
        tipo: 'pago_ejecutado' as const,
        id: p.id,
        etiqueta: `Ejecutó pago${p.concepto ? ` — ${p.concepto}` : ''}`,
        fecha: p.creadoEn,
      })),
      ...cobrosRegistrados.map((c) => ({
        tipo: 'cobro' as const,
        id: c.id,
        etiqueta: `Registró cobro — ${c.proyecto.nombre}`,
        fecha: c.creadoEn,
      })),
      ...comprobantes.map((c) => ({
        tipo: 'comprobante' as const,
        id: c.id,
        etiqueta: `Generó comprobante ${c.numero}`,
        fecha: c.creadoEn,
      })),
      ...turnosAbiertos.map((t) => ({
        tipo: 'turno_abierto' as const,
        id: t.id,
        etiqueta: `Abrió turno — ${t.proyecto.nombre}`,
        fecha: t.creadoEn,
      })),
      ...turnosCerrados.map((t) => ({
        tipo: 'turno_cerrado' as const,
        id: t.id,
        etiqueta: `Cerró turno — ${t.proyecto.nombre}`,
        fecha: t.creadoEn,
      })),
      ...planillas.map((p) => ({
        tipo: 'planilla' as const,
        id: p.id,
        etiqueta: `Generó planilla — ${p.proyecto.nombre}`,
        fecha: p.generadaEn,
      })),
    ];

    return items.sort((a, b) => b.fecha.getTime() - a.fecha.getTime()).slice(0, 20);
  }

  async findAuditLog(id: string, page: number, pageSize: number) {
    await this.findOne(id);

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { userId: id },
        orderBy: { creadoEn: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where: { userId: id } }),
    ]);

    return { items, total, page, pageSize };
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    return this.prisma.user.update({ where: { id }, data: dto });
  }

  // El usuario ya está autenticado (sesión válida vía AuthGuard), así que se
  // omite la verificación de la contraseña actual que exige better-auth's
  // changePassword — la sesión activa ya es suficiente prueba de identidad.
  async changeOwnPassword(userId: string, newPassword: string) {
    await this.setPassword(userId, newPassword);
  }

  // Cambio de contraseña de otro usuario por un administrador (no requiere
  // la contraseña actual, protegido por @Roles en el controller).
  async changePassword(userId: string, newPassword: string) {
    await this.findOne(userId);
    await this.setPassword(userId, newPassword);
  }

  private async setPassword(userId: string, newPassword: string) {
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
