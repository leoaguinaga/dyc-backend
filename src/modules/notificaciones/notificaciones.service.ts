import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from '../../shared/email/email.service.js';
import type { Role, TipoNotificacion } from '../../prisma/types.js';
import { QueryNotificacionDto } from './dto/query-notificacion.dto.js';

const DIAS_ANTICIPACION_PAGO = 3;

export interface CrearNotificacionInput {
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  entidadTipo?: string;
  entidadId?: string;
}

@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger('Notificaciones');

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
  ) {}

  async crearParaUsuarios(userIds: string[], input: CrearNotificacionInput) {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return;

    const usuarios = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, email: true },
    });

    await this.prisma.notificacion.createMany({
      data: usuarios.map((u) => ({
        userId: u.id,
        tipo: input.tipo,
        titulo: input.titulo,
        mensaje: input.mensaje,
        entidadTipo: input.entidadTipo,
        entidadId: input.entidadId,
      })),
    });

    for (const u of usuarios) {
      void this.email
        .send({ to: u.email, subject: input.titulo, html: `<p>${input.mensaje}</p>` })
        .catch((err: unknown) => this.logger.error(`Error enviando email a ${u.email}: ${String(err)}`));
    }
  }

  async crearParaRoles(roles: Role[], input: CrearNotificacionInput) {
    const usuarios = await this.prisma.user.findMany({
      where: { role: { in: roles } },
      select: { id: true },
    });
    await this.crearParaUsuarios(
      usuarios.map((u) => u.id),
      input,
    );
  }

  async findAllMine(userId: string, query: QueryNotificacionDto) {
    return this.prisma.notificacion.findMany({
      where: { userId, leida: query.leida },
      orderBy: { creadoEn: 'desc' },
      take: query.limit ?? 20,
      skip: query.offset ?? 0,
    });
  }

  async countNoLeidas(userId: string) {
    const count = await this.prisma.notificacion.count({ where: { userId, leida: false } });
    return { count };
  }

  async marcarLeida(id: string, userId: string) {
    await this.prisma.notificacion.updateMany({
      where: { id, userId },
      data: { leida: true, leidaEn: new Date() },
    });
  }

  async marcarTodasLeidas(userId: string) {
    await this.prisma.notificacion.updateMany({
      where: { userId, leida: false },
      data: { leida: true, leidaEn: new Date() },
    });
  }

  /** Evita crear la misma notificación de pago más de una vez en el día. */
  private async yaNotificadoHoy(entidadId: string, tipo: TipoNotificacion) {
    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);
    const existente = await this.prisma.notificacion.findFirst({
      where: { entidadTipo: 'Pago', entidadId, tipo, creadoEn: { gte: inicioDia } },
      select: { id: true },
    });
    return existente !== null;
  }

  @Cron('0 7 * * *')
  async revisarPagos() {
    const pagos = await this.prisma.pago.findMany({
      where: { estado: 'pendiente' },
      include: {
        ordenCompra: { select: { numero: true, proveedor: { select: { razonSocial: true } } } },
      },
    });

    const hoy = new Date();
    const limiteAnticipacion = new Date(hoy.getTime() + DIAS_ANTICIPACION_PAGO * 24 * 60 * 60 * 1000);

    for (const pago of pagos) {
      const vencido = pago.fechaProgramada < hoy;
      const porVencer = !vencido && pago.fechaProgramada <= limiteAnticipacion;
      if (!vencido && !porVencer) continue;

      const tipo: TipoNotificacion = vencido ? 'pago_vencido' : 'pago_por_vencer';
      if (await this.yaNotificadoHoy(pago.id, tipo)) continue;

      const proveedor = pago.ordenCompra.proveedor.razonSocial;
      const numeroOc = pago.ordenCompra.numero;
      const monto = Number(pago.monto).toLocaleString('es-PE', { style: 'currency', currency: 'PEN' });

      await this.crearParaRoles(['gerencia', 'administrador'], {
        tipo,
        titulo: vencido ? 'Pago vencido' : 'Pago próximo a vencer',
        mensaje: vencido
          ? `El pago de ${monto} a ${proveedor} (OC ${numeroOc}) venció el ${pago.fechaProgramada.toLocaleDateString('es-PE')}.`
          : `El pago de ${monto} a ${proveedor} (OC ${numeroOc}) vence el ${pago.fechaProgramada.toLocaleDateString('es-PE')}.`,
        entidadTipo: 'Pago',
        entidadId: pago.id,
      });
    }
  }
}
