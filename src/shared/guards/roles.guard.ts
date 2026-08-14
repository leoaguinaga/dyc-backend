import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '../../prisma/types.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles?.length) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: { role: Role } }>();
    if (!user) return false;

    // admin_ti (administración TI) tiene acceso total a toda la aplicación,
    // sin importar qué roles requiera el endpoint.
    if (user.role === 'admin_ti') return true;

    return requiredRoles.includes(user.role);
  }
}
