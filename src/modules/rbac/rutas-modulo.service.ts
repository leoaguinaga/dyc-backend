import { Injectable, OnModuleInit, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { Role as ROLES, type Role } from '../../prisma/types.js';
import { ROLES_KEY } from '../../shared/decorators/roles.decorator.js';
import { PERMISSIONS_KEY } from '../../shared/decorators/permissions.decorator.js';
import { IS_PUBLIC_KEY } from '../../shared/decorators/public.decorator.js';
import { REQUIRE_RESPONSABLE_ASISTENCIA_KEY } from '../../shared/decorators/require-responsable-asistencia.decorator.js';
import { ROLES_SIEMPRE_PASAN } from '../../shared/guards/responsable-asistencia.guard.js';
import {
  MODULO_KEY,
  NIVEL_MODULO_KEY,
} from '../../shared/decorators/modulo.decorator.js';
import { nivelPorMetodo, type ModuloKey, type NivelAcceso } from './modulos.js';

export interface RutaModulo {
  modulo: ModuloKey;
  ruta: string;
  nivel: Exclude<NivelAcceso, 'ninguno'>;
  /** Roles de @Roles; null = cualquier usuario autenticado. */
  roles: Role[] | null;
  /** Códigos de @Permissions: si existen, reemplazan a `roles` en RolesGuard. */
  permisos: string[] | null;
}

/**
 * Recorre los controladores al arrancar y arma el inventario de endpoints por
 * módulo con sus @Roles. Con eso se calcula el acceso "por defecto" que define el
 * código, para mostrarlo junto a las excepciones configuradas.
 */
@Injectable()
export class RutasModuloService implements OnModuleInit {
  private rutas: RutaModulo[] = [];

  constructor(
    private discovery: DiscoveryService,
    private scanner: MetadataScanner,
    private reflector: Reflector,
  ) {}

  onModuleInit() {
    this.rutas = [];
    for (const wrapper of this.discovery.getControllers()) {
      const instance = wrapper.instance as object | undefined;
      const metatype = wrapper.metatype as (new () => unknown) | null;
      if (!instance || !metatype) continue;
      const prototype = Object.getPrototypeOf(instance) as object;
      const base =
        (Reflect.getMetadata(PATH_METADATA, metatype) as string) ?? '';

      for (const nombre of this.scanner.getAllMethodNames(prototype)) {
        const handler = (prototype as Record<string, unknown>)[nombre];
        if (typeof handler !== 'function') continue;
        const metodo = Reflect.getMetadata(METHOD_METADATA, handler) as
          | RequestMethod
          | undefined;
        if (metodo === undefined) continue;

        const targets = [handler, metatype];
        if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets))
          continue;
        const modulo = this.reflector.getAllAndOverride<ModuloKey | null>(
          MODULO_KEY,
          targets,
        );
        if (!modulo) continue;

        const verbo = RequestMethod[metodo];
        let roles = this.reflector.getAllAndOverride<Role[]>(
          ROLES_KEY,
          targets,
        );
        // ResponsableAsistenciaGuard filtra además por encargado de la obra: en la
        // práctica pasan los roles fijos del guard y el prevencionista (pdr).
        if (
          this.reflector.getAllAndOverride<boolean>(
            REQUIRE_RESPONSABLE_ASISTENCIA_KEY,
            targets,
          )
        ) {
          const responsables = [...ROLES_SIEMPRE_PASAN, 'pdr'];
          roles = (roles?.length ? roles : Object.values(ROLES)).filter((r) =>
            responsables.includes(r),
          );
        }
        const permisos = this.reflector.getAllAndOverride<string[]>(
          PERMISSIONS_KEY,
          targets,
        );
        const sub =
          (Reflect.getMetadata(PATH_METADATA, handler) as string) ?? '';
        this.rutas.push({
          modulo,
          ruta: `${verbo} /${[base, sub].filter((p) => p && p !== '/').join('/')}`,
          nivel:
            this.reflector.getAllAndOverride<'ver' | 'editar'>(
              NIVEL_MODULO_KEY,
              targets,
            ) ?? nivelPorMetodo(verbo),
          roles: roles?.length ? roles : null,
          permisos: roles?.length && permisos?.length ? permisos : null,
        });
      }
    }
  }

  listar(): readonly RutaModulo[] {
    return this.rutas;
  }
}
