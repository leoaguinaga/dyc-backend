import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { fromNodeHeaders } from 'better-auth/node';
import { Request } from 'express';
import { AuthService } from '../../modules/auth/auth.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { Role } from '../../prisma/types.js';

export interface AuthenticatedUser {
  id: string;
  role: Role;
  name: string;
  email: string;
}

declare module 'express' {
  interface Request {
    user?: AuthenticatedUser;
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private authService: AuthService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const getSession = this.authService.auth.api.getSession as (opts: {
      headers: Headers;
    }) => Promise<{ user: { id: string } } | null>;
    const session = await getSession({ headers: fromNodeHeaders(req.headers) });

    if (!session?.user) throw new UnauthorizedException('Sesión no válida');

    // better-auth only returns standard fields; fetch role from DB
    const dbUser = await this.prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!dbUser) throw new UnauthorizedException('Usuario no encontrado');

    req.user = dbUser;
    return true;
  }
}
