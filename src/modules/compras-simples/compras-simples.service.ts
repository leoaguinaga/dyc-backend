import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  CreateCompraSimpleDto,
  CreateCompraSimpleGrupoDto,
} from './dto/create-compra-simple.dto.js';
import { AprobarGrupoDto, ObservarGrupoDto } from './dto/decision-grupo.dto.js';
import type { Role, TipoRequerimiento } from '../../prisma/types.js';
import { STORAGE_PROVIDER } from '../../shared/storage/storage.interface.js';
import type { StorageProvider } from '../../shared/storage/storage.interface.js';
import { AppEvents } from '../../shared/events/events.js';

// Roles que pueden registrar una compra simple (compra ya cotizada/realizada)
const ROLES_CREACION: Role[] = [
  'supervisor',
  'supervisor_civil',
  'supervisor_electrico',
  'pdr',
  'administrador',
];

// Qué tipo de compra puede registrar cada rol (mismo criterio que requerimientos)
const ROLE_TIPOS: Partial<Record<Role, TipoRequerimiento[]>> = {
  supervisor: ['civil'],
  supervisor_civil: ['civil'],
  supervisor_electrico: ['electrico'],
  pdr: ['seguridad'],
  administrador: ['electrico', 'civil', 'seguridad', 'administrativo'],
};

// Paso 1: aprobación técnica del área correspondiente al tipo de compra
const TIPO_APPROVERS_TECNICO: Record<TipoRequerimiento, Role[]> = {
  civil: ['ing_civil', 'administrador'],
  electrico: ['ing_electrico', 'administrador'],
  seguridad: ['jefe_sig', 'administrador'],
  administrativo: ['logistica', 'administrador'],
};

// Paso 2: aprobación final de gerencia (recién aquí se genera el pago)
const ROLES_APROBACION_GERENCIA: Role[] = ['gerencia', 'administrador'];

const GRUPO_INCLUDE = {
  proveedor: {
    select: { id: true, razonSocial: true, ruc: true },
  },
  pagoTrabajador: { select: { id: true, nombre: true } },
  items: true,
  archivos: {
    include: { subidoPor: { select: { id: true, name: true } } },
    orderBy: { creadoEn: 'asc' as const },
  },
  aprobadoPor: { select: { id: true, name: true } },
  historial: {
    include: { actor: { select: { id: true, name: true, role: true } } },
    orderBy: { creadoEn: 'asc' as const },
  },
} as const;

const COMPRA_SIMPLE_INCLUDE = {
  proyecto: { select: { id: true, codigo: true, nombre: true } },
  creadoPor: { select: { id: true, name: true, email: true, role: true } },
  grupos: { include: GRUPO_INCLUDE, orderBy: { creadoEn: 'asc' as const } },
} as const;

function montoGrupo(items: CreateCompraSimpleGrupoDto['items']) {
  return items.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0);
}

@Injectable()
export class ComprasSimplesService {
  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private storage: StorageProvider,
    private events: EventEmitter2,
  ) {}

  miTrabajador(userId: string) {
    return this.prisma.trabajador.findUnique({
      where: { userId },
      select: { id: true, nombre: true, banco: true, numeroCuenta: true },
    });
  }

  findAll(query: { proyectoId?: string }) {
    return this.prisma.compraSimple.findMany({
      where: { proyectoId: query.proyectoId },
      include: COMPRA_SIMPLE_INCLUDE,
      orderBy: { creadoEn: 'desc' },
    });
  }

  async findOne(id: string) {
    const compra = await this.prisma.compraSimple.findUnique({
      where: { id },
      include: COMPRA_SIMPLE_INCLUDE,
    });
    if (!compra)
      throw new NotFoundException(`Compra simple ${id} no encontrada`);
    return compra;
  }

  private async findGrupo(grupoId: string) {
    const grupo = await this.prisma.ordenCompra.findUnique({
      where: { id: grupoId },
      include: { ...GRUPO_INCLUDE, compraSimple: true },
    });
    if (!grupo || grupo.origen !== 'simple' || !grupo.compraSimple)
      throw new NotFoundException(`Grupo ${grupoId} no encontrado`);
    return { ...grupo, compraSimple: grupo.compraSimple };
  }

  async create(dto: CreateCompraSimpleDto, userId: string, userRole: Role) {
    if (!ROLES_CREACION.includes(userRole))
      throw new ForbiddenException(
        `El rol "${userRole}" no puede registrar compras simples`,
      );

    const allowed = ROLE_TIPOS[userRole] ?? [];
    if (!allowed.includes(dto.tipo))
      throw new ForbiddenException(
        `El rol "${userRole}" no puede registrar compras simples de tipo "${dto.tipo}"`,
      );

    for (const grupo of dto.grupos) {
      if (!grupo.proveedorId && !grupo.proveedorNombreLibre)
        throw new BadRequestException(
          'Cada grupo debe tener un proveedor registrado o una razón social',
        );
    }

    // "Depositar al trabajador" siempre significa el propio solicitante —
    // se resuelve una sola vez aquí, nunca se elige desde el cliente. Solo
    // hace falta que exista la ficha cuando el método es "registrado" (se
    // necesita su banco/cuenta guardados); yape/plin/transferencia ya traen
    // todos los datos del depósito escritos en el propio formulario.
    const requiereTrabajador = dto.grupos.some(
      (g) => g.destinoPago === 'trabajador',
    );
    const requiereFichaConDatos = dto.grupos.some(
      (g) => g.destinoPago === 'trabajador' && g.pagoMetodo === 'registrado',
    );
    let pagoTrabajadorId: string | undefined;
    if (requiereTrabajador) {
      const trabajador = await this.prisma.trabajador.findUnique({
        where: { userId },
      });
      if (!trabajador && requiereFichaConDatos)
        throw new BadRequestException(
          'Tu usuario no tiene una ficha de trabajador vinculada, no se puede usar "banco/cuenta ya registrados". Elige otro método (Yape, Plin o transferencia) o pide que se te vincule una ficha.',
        );
      pagoTrabajadorId = trabajador?.id;
    }

    const codigo = await this.generateCodigo();
    const year = new Date().getFullYear();
    const baseCount = await this.prisma.ordenCompra.count({
      where: { creadoEn: { gte: new Date(`${year}-01-01`) } },
    });

    return this.prisma.compraSimple.create({
      data: {
        codigo,
        nombre: dto.nombre,
        tipo: dto.tipo,
        urgente: dto.urgente ?? false,
        proyectoId: dto.proyectoId,
        creadoPorId: userId,
        nota: dto.nota,
        grupos: {
          create: dto.grupos.map((grupo, i) => ({
            numero: `OC-${year}-${String(baseCount + i + 1).padStart(4, '0')}`,
            origen: 'simple',
            estado: 'borrador',
            estadoAprobacion: 'pendiente',
            proyectoId: dto.proyectoId,
            proveedorId: grupo.proveedorId,
            proveedorNombreLibre: grupo.proveedorId
              ? undefined
              : grupo.proveedorNombreLibre,
            fechaEntrega: grupo.fechaEntrega
              ? new Date(grupo.fechaEntrega)
              : undefined,
            montoTotal: montoGrupo(grupo.items),
            destinoPago: grupo.destinoPago,
            pagoBanco:
              grupo.destinoPago === 'empresa' ? grupo.pagoBanco : undefined,
            pagoNumeroCuenta:
              grupo.destinoPago === 'empresa'
                ? grupo.pagoNumeroCuenta
                : undefined,
            pagoRazonSocial:
              grupo.destinoPago === 'empresa'
                ? grupo.pagoRazonSocial
                : undefined,
            pagoMetodo:
              grupo.destinoPago === 'trabajador' ? grupo.pagoMetodo : undefined,
            pagoTrabajadorBanco:
              grupo.destinoPago === 'trabajador'
                ? grupo.pagoTrabajadorBanco
                : undefined,
            pagoTrabajadorNumeroCuenta:
              grupo.destinoPago === 'trabajador'
                ? grupo.pagoTrabajadorNumeroCuenta
                : undefined,
            pagoTrabajadorNumero:
              grupo.destinoPago === 'trabajador'
                ? grupo.pagoTrabajadorNumero
                : undefined,
            pagoTrabajadorId:
              grupo.destinoPago === 'trabajador' ? pagoTrabajadorId : undefined,
            creadoPorId: userId,
            items: {
              create: grupo.items.map((item) => ({
                descripcion: item.descripcion,
                cantidad: item.cantidad,
                unidad: item.unidad ?? 'und',
                precioUnitario: item.precioUnitario,
                precioTotal: item.cantidad * item.precioUnitario,
              })),
            },
            historial: {
              create: {
                estado: 'pendiente',
                actorId: userId,
                actorRole: userRole,
              },
            },
          })),
        },
      },
      include: COMPRA_SIMPLE_INCLUDE,
    });
  }

  /** Roles habilitados para decidir (aprobar/observar) el paso actual del grupo. */
  private rolesParaPaso(
    estadoActual: 'pendiente' | 'aprobada_tecnico',
    tipo: TipoRequerimiento,
  ): Role[] {
    return estadoActual === 'pendiente'
      ? TIPO_APPROVERS_TECNICO[tipo]
      : ROLES_APROBACION_GERENCIA;
  }

  async aprobarGrupo(
    grupoId: string,
    dto: AprobarGrupoDto,
    userId: string,
    userRole: Role,
  ) {
    const grupo = await this.findGrupo(grupoId);
    if (
      grupo.estadoAprobacion !== 'pendiente' &&
      grupo.estadoAprobacion !== 'aprobada_tecnico'
    )
      throw new BadRequestException(
        `Solo se pueden aprobar grupos en estado "pendiente" o "aprobada_tecnico" (actual: "${grupo.estadoAprobacion}")`,
      );

    const rolesPermitidos = this.rolesParaPaso(
      grupo.estadoAprobacion,
      grupo.compraSimple.tipo,
    );
    if (!rolesPermitidos.includes(userRole))
      throw new ForbiddenException(
        `El rol "${userRole}" no puede aprobar este paso de la compra simple`,
      );

    // Paso 1: aprobación del área técnica — todavía no genera el pago.
    if (grupo.estadoAprobacion === 'pendiente') {
      const actualizado = await this.prisma.$transaction(async (tx) => {
        const oc = await tx.ordenCompra.update({
          where: { id: grupoId },
          data: {
            estadoAprobacion: 'aprobada_tecnico',
            notaAprobacion: null,
            aprobadoPorId: userId,
            aprobadoEn: new Date(),
          },
          include: GRUPO_INCLUDE,
        });
        await tx.compraSimpleGrupoHistorial.create({
          data: {
            grupoId,
            estado: 'aprobada_tecnico',
            actorId: userId,
            actorRole: userRole,
          },
        });
        return oc;
      });

      this.events.emit(AppEvents.COMPRA_SIMPLE_APROBACION_TECNICA, {
        grupoId: actualizado.id,
        compraSimpleCodigo: grupo.compraSimple.codigo,
        compraSimpleNombre: grupo.compraSimple.nombre,
        compraSimpleId: grupo.compraSimple.id,
      });

      return actualizado;
    }

    // Paso 2: aprobación de gerencia — recién aquí se genera el pago.
    const proveedorNombre =
      grupo.proveedor?.razonSocial ?? grupo.proveedorNombreLibre ?? '—';

    // La fecha de pago programada prioriza lo indicado al aprobar; si no se
    // especifica, usa la fecha solicitada por quien registró la compra (para
    // que el pago no nazca "vencido" por defecto al usar la fecha de hoy).
    const fechaProgramada = dto.fechaProgramadaPago
      ? new Date(dto.fechaProgramadaPago)
      : (grupo.fechaEntrega ?? new Date());

    const actualizado = await this.prisma.$transaction(async (tx) => {
      const oc = await tx.ordenCompra.update({
        where: { id: grupoId },
        data: {
          estadoAprobacion: 'aprobada',
          notaAprobacion: null,
          aprobadoPorId: userId,
          aprobadoEn: new Date(),
          estado: 'recibida',
          fechaEmision: new Date(),
          fechaEntregaReal: grupo.fechaEntregaReal ?? new Date(),
        },
        include: GRUPO_INCLUDE,
      });
      await tx.pago.create({
        data: {
          ordenCompraId: grupoId,
          monto: oc.montoTotal,
          porcentaje: 100,
          fechaProgramada,
          registradoPorId: userId,
          tipoBeneficiario:
            grupo.destinoPago === 'trabajador' ? 'trabajador' : 'proveedor',
          beneficiarioTrabajadorId:
            grupo.destinoPago === 'trabajador'
              ? grupo.pagoTrabajadorId
              : undefined,
        },
      });
      await tx.compraSimpleGrupoHistorial.create({
        data: {
          grupoId,
          estado: 'aprobada',
          actorId: userId,
          actorRole: userRole,
        },
      });
      return oc;
    });

    this.events.emit(AppEvents.ORDEN_COMPRA_GENERADA, {
      ordenCompraId: actualizado.id,
      numero: actualizado.numero,
      proveedorNombre,
    });

    return actualizado;
  }

  async observarGrupo(
    grupoId: string,
    dto: ObservarGrupoDto,
    userId: string,
    userRole: Role,
  ) {
    const grupo = await this.findGrupo(grupoId);
    if (
      grupo.estadoAprobacion !== 'pendiente' &&
      grupo.estadoAprobacion !== 'aprobada_tecnico'
    )
      throw new BadRequestException(
        `Solo se pueden observar grupos en estado "pendiente" o "aprobada_tecnico" (actual: "${grupo.estadoAprobacion}")`,
      );

    const rolesPermitidos = this.rolesParaPaso(
      grupo.estadoAprobacion,
      grupo.compraSimple.tipo,
    );
    if (!rolesPermitidos.includes(userRole))
      throw new ForbiddenException(
        `El rol "${userRole}" no puede observar este paso de la compra simple`,
      );

    return this.prisma.$transaction(async (tx) => {
      const oc = await tx.ordenCompra.update({
        where: { id: grupoId },
        data: {
          estadoAprobacion: 'observada',
          notaAprobacion: dto.nota,
          aprobadoPorId: userId,
          aprobadoEn: new Date(),
        },
        include: GRUPO_INCLUDE,
      });
      await tx.compraSimpleGrupoHistorial.create({
        data: {
          grupoId,
          estado: 'observada',
          nota: dto.nota,
          actorId: userId,
          actorRole: userRole,
        },
      });
      return oc;
    });
  }

  async reenviarGrupo(grupoId: string, userId: string, userRole: Role) {
    const grupo = await this.findGrupo(grupoId);
    if (grupo.creadoPorId !== userId)
      throw new ForbiddenException(
        'Solo el creador de la compra simple puede reenviar el grupo',
      );
    if (grupo.estadoAprobacion !== 'observada')
      throw new BadRequestException(
        'Solo se pueden reenviar grupos observados',
      );

    return this.prisma.$transaction(async (tx) => {
      const oc = await tx.ordenCompra.update({
        where: { id: grupoId },
        data: {
          estadoAprobacion: 'pendiente',
          notaAprobacion: null,
          aprobadoPorId: null,
          aprobadoEn: null,
        },
        include: GRUPO_INCLUDE,
      });
      await tx.compraSimpleGrupoHistorial.create({
        data: {
          grupoId,
          estado: 'pendiente',
          actorId: userId,
          actorRole: userRole,
          nota: 'Reenviado tras observación',
        },
      });
      return oc;
    });
  }

  async subirArchivo(
    grupoId: string,
    file: Express.Multer.File,
    userId: string,
  ) {
    const grupo = await this.findGrupo(grupoId);
    if (grupo.creadoPorId !== userId)
      throw new ForbiddenException(
        'Solo el creador de la compra simple puede adjuntar la factura',
      );
    if (grupo.estadoAprobacion !== 'aprobada')
      throw new BadRequestException(
        'Solo se puede adjuntar la factura de un grupo ya aprobado',
      );

    const { url } = await this.storage.save({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      folder: 'compras-simples',
    });

    return this.prisma.compraSimpleGrupoArchivo.create({
      data: {
        grupoId,
        url,
        nombreOriginal: file.originalname,
        mimeType: file.mimetype,
        subidoPorId: userId,
      },
    });
  }

  private async generateCodigo(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.compraSimple.count({
      where: { creadoEn: { gte: new Date(`${year}-01-01`) } },
    });
    return `CS-${year}-${String(count + 1).padStart(4, '0')}`;
  }
}
