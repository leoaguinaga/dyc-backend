import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from '../../shared/email/email.service.js';
import type { Role, TipoNotificacion } from '../../prisma/types.js';
import { QueryNotificacionDto } from './dto/query-notificacion.dto.js';
import { hoyLima } from '../../shared/date/fecha.util.js';
import { promises as fs } from 'fs';
import { join, resolve, sep, basename } from 'path';
import { buildActionEmail, buildDocumentEmail, type EmailTone } from '../../shared/email/email-template.js';
import { montoConIgv } from '../../shared/money/igv.util.js';

const DIAS_ANTICIPACION_PAGO = 3;
const DIAS_ANTICIPACION_COBRO = 3;

export interface CrearNotificacionInput {
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  entidadTipo?: string;
  entidadId?: string;
}

interface CrearNotificacionOptions {
  enviarEmail?: boolean;
}

interface ResumenVencimientoItem {
  titulo: string;
  detalle: string;
  monto: string;
  vencido: boolean;
}

function notificationTone(tipo: TipoNotificacion): EmailTone {
  if (tipo === 'pago_vencido' || tipo === 'cobro_vencido') return 'critical';
  if (
    tipo === 'pago_por_vencer' ||
    tipo === 'cobro_por_vencer' ||
    tipo === 'asistencia_cierre_automatico'
  ) return 'warning';
  if (tipo === 'requerimiento_aprobado' || tipo === 'requerimiento_recibido') return 'success';
  if (
    tipo === 'requerimiento_creado' ||
    tipo === 'requerimiento_pendiente_conformidad' ||
    tipo === 'solicitud_lista_adjudicar' ||
    tipo === 'compra_simple_pendiente_gerencia' ||
    tipo === 'compra_simple_pendiente_tecnico'
  ) return 'action';
  return 'info';
}

// Nombre legible del tipo de documento; el valor crudo de `entidadTipo` no se muestra al usuario.
const ENTIDAD_LABEL: Record<string, string> = {
  Requerimiento: 'Requerimiento',
  SolicitudCotizacion: 'Solicitud de cotización',
  OrdenCompra: 'Orden de compra',
  CompraSimple: 'Compra simple',
  Pago: 'Pago',
  Proyecto: 'Obra',
  Cobro: 'Cobro',
  Planilla: 'Planilla',
  Turno: 'Jornada',
};

const MAX_ADJUNTOS_BYTES = 5 * 1024 * 1024;
const ROLES_CORREO_DETALLADO = ['gerencia'] as const;
const ROLES_CORREO_GENERICO = ['logistica', 'administrador', 'admin_ti'] as const;

const formatoSoles = (n: number) =>
  `S/ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function notificationAction(input: CrearNotificacionInput) {
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  const paths: Record<string, { path: string; label: string }> = {
    Requerimiento: { path: `/requerimientos/${input.entidadId}`, label: 'Ver requerimiento' },
    SolicitudCotizacion: { path: `/cotizaciones/${input.entidadId}`, label: 'Revisar cotización' },
    OrdenCompra: { path: `/ordenes-compra/${input.entidadId}`, label: 'Ver orden de compra' },
    CompraSimple: { path: `/compras-simples/${input.entidadId}`, label: 'Revisar compra' },
    Pago: { path: '/pagos', label: 'Revisar pago' },
    Proyecto: { path: `/proyectos/${input.entidadId}`, label: 'Ver obra' },
    Cobro: { path: '/dashboard', label: 'Abrir sistema' },
    Planilla: { path: '/asistencia', label: 'Ver planilla' },
    Turno: { path: `/asistencia/${input.entidadId}`, label: 'Revisar jornada' },
  };
  const target = input.entidadTipo ? paths[input.entidadTipo] : undefined;
  if (!target) return { actionLabel: 'Abrir sistema', actionUrl: frontendUrl };
  return { actionLabel: target.label, actionUrl: new URL(target.path, frontendUrl).toString() };
}

@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger('Notificaciones');

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
  ) {}

  async crearParaUsuarios(
    userIds: string[],
    input: CrearNotificacionInput,
    options: CrearNotificacionOptions = {},
  ) {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return;

    const usuarios = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, email: true, correoContacto: true },
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

    if (options.enviarEmail === false) return;

    for (const u of usuarios) {
      const destinatarios = [...new Set([u.email, ...(u.correoContacto ? [u.correoContacto] : [])])];
      const action = notificationAction(input);
      const email = buildActionEmail({
        title: input.titulo,
        message: input.mensaje,
        tone: notificationTone(input.tipo),
        reference: input.entidadTipo ? ENTIDAD_LABEL[input.entidadTipo] : undefined,
        ...action,
      });
      for (const to of destinatarios) {
        void this.email
          .send({ to, subject: input.titulo, ...email })
          .catch((err: unknown) => this.logger.error(`Error enviando email a ${to}: ${String(err)}`));
      }
    }
  }

  /**
   * Correos de una orden de compra recién emitida. Gerencia recibe el detalle con monto, ficha y
   * accesos a la orden y a sus pagos; el resto de gestores conserva el aviso genérico. Nunca lanza:
   * un fallo de correo no debe romper la emisión de la orden.
   */
  async enviarCorreosOrdenCompra(ordenCompraId: string) {
    try {
      const oc = await this.prisma.ordenCompra.findUnique({
        where: { id: ordenCompraId },
        include: {
          proyecto: { select: { codigo: true, nombre: true } },
          proveedor: { select: { razonSocial: true } },
          creadoPor: { select: { name: true } },
          solicitud: {
            select: {
              requerimiento: { select: { tipo: true, prioridad: true, creadoPor: { select: { name: true } } } },
              cotizaciones: {
                where: { estado: 'aprobada' },
                select: { proveedorId: true, archivos: { select: { nombre: true, url: true } } },
              },
            },
          },
        },
      });
      if (!oc) return;

      const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
      const ordenUrl = new URL(`/ordenes-compra/${oc.id}`, frontendUrl).toString();
      const proveedor = oc.proveedor?.razonSocial ?? oc.proveedorNombreLibre ?? '—';
      const proyecto = oc.proyecto.codigo ? `${oc.proyecto.codigo} · ${oc.proyecto.nombre}` : oc.proyecto.nombre;
      const requerimiento = oc.solicitud?.requerimiento ?? null;
      const prioridad = requerimiento?.prioridad ?? 'normal';

      const destinatarios = async (roles: readonly string[]) => {
        const users = await this.prisma.user.findMany({
          where: { role: { in: [...roles] as Role[] } },
          select: { email: true, correoContacto: true },
        });
        return [...new Set(users.flatMap((u) => [u.email, ...(u.correoContacto ? [u.correoContacto] : [])]))];
      };
      const enviar = (to: string, subject: string, content: { html: string; text: string }, attachments?: Array<{ filename: string; content: Buffer }>) =>
        this.email
          .send({ to, subject, ...content, attachments })
          .catch((err: unknown) => this.logger.error(`Error enviando email de OC a ${to}: ${String(err)}`));

      // Detalle para gerencia.
      const adjuntos = await this.adjuntosCotizacion(
        oc.solicitud?.cotizaciones.filter((c) => c.proveedorId === oc.proveedorId).flatMap((c) => c.archivos) ?? [],
      );
      const monto = montoConIgv(Number(oc.montoTotal), oc.incluyeIgv);
      const detallado = buildDocumentEmail({
        statusLabel: 'Orden emitida',
        tone: prioridad === 'urgente' ? 'critical' : 'action',
        title: `Orden de compra ${oc.numero} · ${proveedor}`,
        amountLabel: 'MONTO TOTAL DE LA ORDEN',
        amount: formatoSoles(monto),
        amountNote: '(inc. IGV)',
        details: [
          { label: 'Orden de compra', value: oc.numero },
          { label: 'Solicitado por', value: requerimiento?.creadoPor.name ?? oc.creadoPor.name },
          { label: 'Proveedor', value: proveedor },
          { label: 'Proyecto', value: proyecto },
          ...(oc.concepto || oc.nombre ? [{ label: 'Concepto', value: (oc.concepto ?? oc.nombre) as string }] : []),
          ...(prioridad !== 'normal'
            ? [{ label: 'Prioridad', value: prioridad.toUpperCase(), critical: prioridad === 'urgente' }]
            : []),
        ],
        attachments: adjuntos.map((a) => a.filename),
        primaryAction: { label: 'Revisar orden de compra', url: ordenUrl },
        secondaryAction: { label: 'Ver pagos programados', url: new URL('/pagos', frontendUrl).toString() },
        detailLink: { label: 'Ver detalle completo en el sistema', url: ordenUrl },
        preheader: `${oc.numero} · ${formatoSoles(monto)} · ${proyecto}`,
      });
      const asunto = `${prioridad === 'urgente' ? '[URGENTE] ' : ''}Orden de compra ${oc.numero} - ${formatoSoles(monto)} - ${oc.proyecto.nombre}`;
      for (const to of await destinatarios(ROLES_CORREO_DETALLADO)) void enviar(to, asunto, detallado, adjuntos.length ? adjuntos : undefined);

      // Aviso genérico para el resto de gestores.
      const generico = buildActionEmail({
        title: 'Nueva orden de compra',
        message: `Se generó la OC ${oc.numero} para ${proveedor}.`,
        tone: 'info',
        actionLabel: 'Ver orden de compra',
        actionUrl: ordenUrl,
        reference: oc.numero,
      });
      for (const to of await destinatarios(ROLES_CORREO_GENERICO)) void enviar(to, 'Nueva orden de compra', generico);
    } catch (err) {
      this.logger.error(`Error preparando los correos de la OC ${ordenCompraId}: ${String(err)}`);
    }
  }

  /** Adjunta las cotizaciones del almacenamiento local, hasta el tope de tamaño; omite lo que no pueda leer. */
  private async adjuntosCotizacion(archivos: Array<{ nombre: string; url: string }>) {
    const prefijo = '/uploads/';
    const base = resolve(join(process.cwd(), 'uploads'));
    const resultado: Array<{ filename: string; content: Buffer }> = [];
    let total = 0;
    for (const archivo of archivos) {
      if (!archivo.url.startsWith(prefijo)) continue;
      const ruta = resolve(base, archivo.url.slice(prefijo.length));
      if (!ruta.startsWith(`${base}${sep}`)) continue;
      try {
        const content = await fs.readFile(ruta);
        if (total + content.length > MAX_ADJUNTOS_BYTES) continue;
        total += content.length;
        resultado.push({ filename: basename(archivo.nombre) || basename(ruta), content });
      } catch {
        // Archivo ausente o ilegible: el correo sale igual, sin ese adjunto.
      }
    }
    return resultado;
  }

  /** Notifica a los usuarios del rol que están asignados a la obra. */
  async crearParaAsignadosDeObra(
    role: Role,
    proyectoId: string,
    input: CrearNotificacionInput,
    options?: CrearNotificacionOptions,
  ) {
    const usuarios = await this.prisma.user.findMany({
      where: { role, proyectosComoSupervisor: { some: { proyectoId } } },
      select: { id: true },
    });
    await this.crearParaUsuarios(
      usuarios.map((u) => u.id),
      input,
      options,
    );
  }

  async crearParaRoles(
    roles: Role[],
    input: CrearNotificacionInput,
    options?: CrearNotificacionOptions,
  ) {
    const usuarios = await this.prisma.user.findMany({
      where: { role: { in: roles } },
      select: { id: true },
    });
    await this.crearParaUsuarios(
      usuarios.map((u) => u.id),
      input,
      options,
    );
  }

  private async enviarResumenVencimientos(
    titulo: string,
    mensaje: string,
    actionUrl: string,
    items: ResumenVencimientoItem[],
  ) {
    if (items.length === 0) return;

    const usuarios = await this.prisma.user.findMany({
      where: { role: { in: ['gerencia', 'administrador', 'tesoreria'] } },
      select: { email: true, correoContacto: true },
    });
    const vencidos = items.filter((item) => item.vencido).length;
    const email = buildActionEmail({
      title: titulo,
      message: mensaje,
      tone: vencidos > 0 ? 'critical' : 'warning',
      actionLabel: 'Revisar en Finanzas',
      actionUrl,
      reference: `${items.length} ${items.length === 1 ? 'registro requiere' : 'registros requieren'} atención`,
      items: items.map((item) => ({
        title: item.titulo,
        detail: item.detalle,
        emphasis: item.monto,
      })),
    });

    for (const usuario of usuarios) {
      const destinatarios = [...new Set([usuario.email, ...(usuario.correoContacto ? [usuario.correoContacto] : [])])];
      for (const to of destinatarios) {
        void this.email
          .send({ to, subject: titulo, ...email })
          .catch((err: unknown) => this.logger.error(`Error enviando resumen de vencimientos a ${to}: ${String(err)}`));
      }
    }
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

  /** Evita crear la misma notificación de recordatorio más de una vez en el día. */
  private async yaNotificadoHoy(
    entidadTipo: string,
    entidadId: string,
    tipo: TipoNotificacion,
  ) {
    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);
    const existente = await this.prisma.notificacion.findFirst({
      where: { entidadTipo, entidadId, tipo, creadoEn: { gte: inicioDia } },
      select: { id: true },
    });
    return existente !== null;
  }

  @Cron('0 7 * * *')
  async revisarPagos() {
    const pagos = await this.prisma.pago.findMany({
      where: { estado: 'pendiente' },
      select: {
        id: true, fechaProgramada: true, monto: true, concepto: true, beneficiarioNombre: true,
        ordenCompra: { select: { numero: true, proveedorNombreLibre: true, proveedor: { select: { razonSocial: true } } } },
      },
    });

    const hoy = hoyLima();
    const limiteAnticipacion = new Date(hoy.getTime() + DIAS_ANTICIPACION_PAGO * 24 * 60 * 60 * 1000);

    const resumen: ResumenVencimientoItem[] = [];
    for (const pago of pagos) {
      const vencido = pago.fechaProgramada < hoy;
      const porVencer = !vencido && pago.fechaProgramada <= limiteAnticipacion;
      if (!vencido && !porVencer) continue;

      const tipo: TipoNotificacion = vencido ? 'pago_vencido' : 'pago_por_vencer';
      if (await this.yaNotificadoHoy('Pago', pago.id, tipo)) continue;

      const proveedor =
        pago.beneficiarioNombre ??
        pago.ordenCompra?.proveedor?.razonSocial ??
        pago.ordenCompra?.proveedorNombreLibre ??
        pago.concepto ??
        '—';
      const referencia = pago.ordenCompra ? ` (OC ${pago.ordenCompra.numero})` : '';
      const monto = Number(pago.monto).toLocaleString('es-PE', { style: 'currency', currency: 'PEN' });

      await this.crearParaRoles(['gerencia', 'administrador', 'tesoreria'], {
        tipo,
        titulo: vencido ? 'Pago vencido' : 'Pago próximo a vencer',
        mensaje: vencido
          ? `El pago de ${monto} a ${proveedor}${referencia} venció el ${pago.fechaProgramada.toLocaleDateString('es-PE')}.`
          : `El pago de ${monto} a ${proveedor}${referencia} vence el ${pago.fechaProgramada.toLocaleDateString('es-PE')}.`,
        entidadTipo: 'Pago',
        entidadId: pago.id,
      }, { enviarEmail: false });

      resumen.push({
        titulo: `${vencido ? 'Vencido' : 'Vence'} · ${proveedor}${referencia}`,
        detalle: vencido
          ? `Venció el ${pago.fechaProgramada.toLocaleDateString('es-PE')}`
          : `Vence el ${pago.fechaProgramada.toLocaleDateString('es-PE')}`,
        monto,
        vencido,
      });
    }

    const vencidos = resumen.filter((item) => item.vencido).length;
    const proximos = resumen.length - vencidos;
    await this.enviarResumenVencimientos(
      vencidos > 0 ? 'Resumen de pagos que requieren atención' : 'Resumen de próximos vencimientos de pagos',
      vencidos > 0
        ? `Tienes ${vencidos} ${vencidos === 1 ? 'pago vencido' : 'pagos vencidos'}${proximos ? ` y ${proximos} próximo${proximos === 1 ? '' : 's'} a vencer` : ''}.`
        : `Tienes ${proximos} ${proximos === 1 ? 'pago próximo a vencer' : 'pagos próximos a vencer'}.`,
      new URL('/pagos', process.env.FRONTEND_URL ?? 'http://localhost:3000').toString(),
      resumen,
    );
  }

  @Cron('0 7 * * *')
  async revisarCobros() {
    const cobros = await this.prisma.cobro.findMany({
      where: { estado: 'pendiente' },
      include: { proyecto: { select: { codigo: true, nombre: true } } },
    });

    const hoy = hoyLima();
    const limiteAnticipacion = new Date(
      hoy.getTime() + DIAS_ANTICIPACION_COBRO * 24 * 60 * 60 * 1000,
    );

    const resumen: ResumenVencimientoItem[] = [];
    for (const cobro of cobros) {
      const vencido = cobro.fechaProgramada < hoy;
      const porVencer = !vencido && cobro.fechaProgramada <= limiteAnticipacion;
      if (!vencido && !porVencer) continue;

      const tipo: TipoNotificacion = vencido ? 'cobro_vencido' : 'cobro_por_vencer';
      if (await this.yaNotificadoHoy('Cobro', cobro.id, tipo)) continue;

      const obra = cobro.proyecto.codigo ?? cobro.proyecto.nombre;
      const monto = Number(cobro.monto).toLocaleString('es-PE', {
        style: 'currency',
        currency: 'PEN',
      });

      await this.crearParaRoles(['gerencia', 'administrador'], {
        tipo,
        titulo: vencido ? 'Cobro vencido' : 'Cobro próximo a vencer',
        mensaje: vencido
          ? `El cobro de ${monto} de la obra ${obra} venció el ${cobro.fechaProgramada.toLocaleDateString('es-PE')}.`
          : `El cobro de ${monto} de la obra ${obra} vence el ${cobro.fechaProgramada.toLocaleDateString('es-PE')}.`,
        entidadTipo: 'Cobro',
        entidadId: cobro.id,
      }, { enviarEmail: false });

      resumen.push({
        titulo: `${vencido ? 'Vencido' : 'Vence'} · ${obra}`,
        detalle: vencido
          ? `Venció el ${cobro.fechaProgramada.toLocaleDateString('es-PE')}`
          : `Vence el ${cobro.fechaProgramada.toLocaleDateString('es-PE')}`,
        monto,
        vencido,
      });
    }

    const vencidos = resumen.filter((item) => item.vencido).length;
    const proximos = resumen.length - vencidos;
    await this.enviarResumenVencimientos(
      vencidos > 0 ? 'Resumen de cobros que requieren atención' : 'Resumen de próximos vencimientos de cobros',
      vencidos > 0
        ? `Tienes ${vencidos} ${vencidos === 1 ? 'cobro vencido' : 'cobros vencidos'}${proximos ? ` y ${proximos} próximo${proximos === 1 ? '' : 's'} a vencer` : ''}.`
        : `Tienes ${proximos} ${proximos === 1 ? 'cobro próximo a vencer' : 'cobros próximos a vencer'}.`,
      new URL('/dashboard', process.env.FRONTEND_URL ?? 'http://localhost:3000').toString(),
      resumen,
    );
  }
}
