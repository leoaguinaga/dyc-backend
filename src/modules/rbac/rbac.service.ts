import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Role } from '../../prisma/types.js';
import {
  MODULOS,
  ROLES_CONFIGURABLES,
  esModulo,
  nivelAlcanza,
  type ModuloKey,
  type NivelAcceso,
} from './modulos.js';
import { RutasModuloService } from './rutas-modulo.service.js';

// Las excepciones cambian poco y se consultan en cada request: se leen todas de
// una vez y se guardan unos segundos. Las escrituras de este servicio la invalidan.
const CACHE_MS = 30_000;

interface CacheAccesos {
  vence: number;
  porRol: Map<string, NivelAcceso>;
  porUsuario: Map<string, NivelAcceso>;
}

export interface AccesoPorDefecto {
  nivel: NivelAcceso;
  /** Hay endpoints de ese nivel a los que el rol no llega (p. ej. solo algunas acciones). */
  parcial: boolean;
}

const clave = (sujeto: string, modulo: string) => `${sujeto}:${modulo}`;

@Injectable()
export class RbacService {
  private cache: CacheAccesos | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rutas: RutasModuloService,
  ) {}

  async hasAnyPermission(role: Role, required: string[]) {
    if (role === 'admin_ti') return true;
    return (
      (await this.prisma.rolePermission.count({
        where: { role, permission: { code: { in: required }, activo: true } },
      })) > 0
    );
  }

  list() {
    return this.prisma.permission.findMany({
      orderBy: { code: 'asc' },
      include: { roles: { select: { role: true } } },
    });
  }

  async setRoles(code: string, roles: Role[], description?: string) {
    return this.prisma.$transaction(async (tx) => {
      const permission = await tx.permission.upsert({
        where: { code },
        create: { code, description },
        update: { description },
      });
      await tx.rolePermission.deleteMany({
        where: { permissionId: permission.id },
      });
      if (roles.length)
        await tx.rolePermission.createMany({
          data: roles.map((role) => ({ role, permissionId: permission.id })),
        });
      return tx.permission.findUniqueOrThrow({
        where: { id: permission.id },
        include: { roles: { select: { role: true } } },
      });
    });
  }

  // ── Acceso por módulo ────────────────────────────────────────────────────

  /** Excepción que aplica al usuario en el módulo: la suya o, si no, la de su rol. */
  async nivelExcepcion(userId: string, role: Role, modulo: ModuloKey) {
    const cache = await this.accesos();
    return (
      cache.porUsuario.get(clave(userId, modulo)) ??
      cache.porRol.get(clave(role, modulo)) ??
      null
    );
  }

  /** Excepciones vigentes del usuario; null en un módulo = manda el código. */
  async misModulos(userId: string, role: Role) {
    const resultado = {} as Record<ModuloKey, NivelAcceso | null>;
    for (const { key } of MODULOS) {
      resultado[key] =
        role === 'admin_ti'
          ? null
          : await this.nivelExcepcion(userId, role, key);
    }
    return resultado;
  }

  async matriz() {
    const [cache, permisosPorCodigo] = await Promise.all([
      this.accesos(),
      this.rolesPorPermiso(),
    ]);
    return {
      modulos: MODULOS,
      roles: ROLES_CONFIGURABLES,
      celdas: MODULOS.flatMap(({ key }) =>
        ROLES_CONFIGURABLES.map((role) => ({
          modulo: key,
          role,
          porDefecto: this.accesoPorDefecto(role, key, permisosPorCodigo),
          excepcion: cache.porRol.get(clave(role, key)) ?? null,
        })),
      ),
    };
  }

  async accesosUsuario(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    const [cache, permisosPorCodigo] = await Promise.all([
      this.accesos(),
      this.rolesPorPermiso(),
    ]);

    return {
      userId: user.id,
      role: user.role,
      accesoTotal: user.role === 'admin_ti',
      modulos: MODULOS.map(({ key, label }) => {
        const porDefecto = this.accesoPorDefecto(
          user.role,
          key,
          permisosPorCodigo,
        );
        const delRol = cache.porRol.get(clave(user.role, key)) ?? null;
        return {
          modulo: key,
          label,
          // Lo que el usuario tendría sin excepción propia.
          segunRol: delRol ? { nivel: delRol, parcial: false } : porDefecto,
          excepcionRol: delRol,
          excepcion: cache.porUsuario.get(clave(user.id, key)) ?? null,
        };
      }),
    };
  }

  async setNivelRol(
    modulo: string,
    role: Role,
    nivel: NivelAcceso | null,
    editorId: string,
  ) {
    const m = this.validarModulo(modulo);
    if (!ROLES_CONFIGURABLES.includes(role)) {
      throw new BadRequestException(
        `El rol ${role} no se configura por módulo`,
      );
    }
    if (nivel === null) {
      await this.prisma.moduloAcceso.deleteMany({ where: { modulo: m, role } });
    } else {
      await this.prisma.moduloAcceso.upsert({
        where: { modulo_role: { modulo: m, role } },
        create: { modulo: m, role, nivel, actualizadoPorId: editorId },
        update: { nivel, actualizadoPorId: editorId },
      });
    }
    this.cache = null;
    return this.matriz();
  }

  async setNivelUsuario(
    modulo: string,
    userId: string,
    nivel: NivelAcceso | null,
    editorId: string,
  ) {
    const m = this.validarModulo(modulo);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (user.role === 'admin_ti') {
      throw new BadRequestException('Admin TI siempre tiene acceso total');
    }
    if (nivel === null) {
      await this.prisma.moduloAcceso.deleteMany({
        where: { modulo: m, userId },
      });
    } else {
      await this.prisma.moduloAcceso.upsert({
        where: { modulo_userId: { modulo: m, userId } },
        create: { modulo: m, userId, nivel, actualizadoPorId: editorId },
        update: { nivel, actualizadoPorId: editorId },
      });
    }
    this.cache = null;
    return this.accesosUsuario(userId);
  }

  /**
   * Acceso que da el código (@Roles / @Permissions) a un rol en un módulo:
   * "editar" si alcanza algún endpoint de escritura, "ver" si solo lecturas.
   */
  accesoPorDefecto(
    role: Role,
    modulo: ModuloKey,
    rolesPorPermiso: Map<string, Set<Role>>,
  ): AccesoPorDefecto {
    if (role === 'admin_ti') return { nivel: 'editar', parcial: false };
    const rutas = this.rutas.listar().filter((r) => r.modulo === modulo);
    const alcanzables = rutas.filter((r) =>
      r.permisos
        ? r.permisos.some((code) => rolesPorPermiso.get(code)?.has(role))
        : r.roles === null || r.roles.includes(role),
    );
    const nivel: NivelAcceso = alcanzables.some((r) => r.nivel === 'editar')
      ? 'editar'
      : alcanzables.length
        ? 'ver'
        : 'ninguno';
    const delNivel = rutas.filter((r) => nivelAlcanza(nivel, r.nivel)).length;
    return {
      nivel,
      parcial: nivel !== 'ninguno' && alcanzables.length < delNivel,
    };
  }

  private validarModulo(modulo: string): ModuloKey {
    if (!esModulo(modulo))
      throw new BadRequestException(`Módulo desconocido: ${modulo}`);
    return modulo;
  }

  private async rolesPorPermiso() {
    const filas = await this.prisma.rolePermission.findMany({
      where: { permission: { activo: true } },
      select: { role: true, permission: { select: { code: true } } },
    });
    const mapa = new Map<string, Set<Role>>();
    for (const { role, permission } of filas) {
      if (!mapa.has(permission.code)) mapa.set(permission.code, new Set());
      mapa.get(permission.code)!.add(role);
    }
    return mapa;
  }

  private async accesos(): Promise<CacheAccesos> {
    if (this.cache && this.cache.vence > Date.now()) return this.cache;
    const filas = await this.prisma.moduloAcceso.findMany({
      select: { modulo: true, role: true, userId: true, nivel: true },
    });
    const porRol = new Map<string, NivelAcceso>();
    const porUsuario = new Map<string, NivelAcceso>();
    for (const f of filas) {
      if (f.userId) porUsuario.set(clave(f.userId, f.modulo), f.nivel);
      else if (f.role) porRol.set(clave(f.role, f.modulo), f.nivel);
    }
    this.cache = { vence: Date.now() + CACHE_MS, porRol, porUsuario };
    return this.cache;
  }
}
