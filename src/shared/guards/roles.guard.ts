import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Role } from '../../prisma/types.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';
import {
  MODULO_KEY,
  NIVEL_MODULO_KEY,
} from '../decorators/modulo.decorator.js';
import { RbacService } from '../../modules/rbac/rbac.service.js';
import {
  etiquetaModulo,
  nivelAlcanza,
  nivelPorMetodo,
  type ModuloKey,
} from '../../modules/rbac/modulos.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      targets,
    );
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user;

    // admin_ti (administración TI) tiene acceso total a toda la aplicación,
    // sin importar qué roles requiera el endpoint.
    if (user?.role === 'admin_ti') return true;

    // Una excepción de acceso configurada para el módulo manda sobre @Roles,
    // tanto para dar acceso como para quitarlo.
    const modulo = this.reflector.getAllAndOverride<ModuloKey | null>(
      MODULO_KEY,
      targets,
    );
    if (user && modulo) {
      const otorgado = await this.rbac.nivelExcepcion(
        user.id,
        user.role,
        modulo,
      );
      if (otorgado) {
        const requerido =
          this.reflector.getAllAndOverride<'ver' | 'editar'>(
            NIVEL_MODULO_KEY,
            targets,
          ) ?? nivelPorMetodo(req.method);
        if (nivelAlcanza(otorgado, requerido)) return true;
        throw new ForbiddenException(
          otorgado === 'ver'
            ? `Tu acceso a ${etiquetaModulo(modulo)} es de solo lectura`
            : `No tienes acceso a ${etiquetaModulo(modulo)}`,
        );
      }
    }

    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(
      ROLES_KEY,
      targets,
    );
    if (!requiredRoles?.length) return true;
    if (!user) return false;

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      targets,
    );
    if (requiredPermissions?.length) {
      return this.rbac.hasAnyPermission(user.role, requiredPermissions);
    }

    return requiredRoles.includes(user.role);
  }
}
