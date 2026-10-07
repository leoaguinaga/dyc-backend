import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service.js';
import { REQUIRE_RESPONSABLE_ASISTENCIA_KEY } from '../decorators/require-responsable-asistencia.decorator.js';
import type { AuthenticatedUser } from './auth.guard.js';
import {
  estaAsignadoAProyecto,
  requiereAsignacion,
} from '../alcance/asignacion-proyecto.js';

export const ROLES_SIEMPRE_PASAN: string[] = [
  'administrador',
  'gerencia',
  'admin_ti',
  'jefe_sig',
];

@Injectable()
export class ResponsableAsistenciaGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiere = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_RESPONSABLE_ASISTENCIA_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiere) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedUser }>();

    // Administración, gerencia, admin_ti y jefe SIG pueden corregir/operar en
    // nombre del encargado, en cualquier obra.
    if (ROLES_SIEMPRE_PASAN.includes(req.user.role)) {
      return true;
    }

    const proyectoId = req.params['proyectoId'];
    if (!proyectoId || typeof proyectoId !== 'string') {
      throw new ForbiddenException(
        'La ruta no incluye la obra a validar (proyectoId)',
      );
    }

    // El coordinador SSOMA toma asistencia en las obras donde está asignado
    // (ProyectoSupervisor), igual que el prevencionista lo hace en las suyas.
    if (requiereAsignacion(req.user.role)) {
      if (await estaAsignadoAProyecto(this.prisma, req.user.id, proyectoId))
        return true;
      throw new ForbiddenException('No estás asignado a esta obra');
    }

    // El encargado de tomar asistencia es hoy el prevencionista de riesgo
    // (confirmado por el stakeholder 2026-07-31). Si eso cambia, este es el
    // único lugar a ajustar.
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { id: proyectoId },
      select: { prevencionistaId: true },
    });
    if (!proyecto) throw new ForbiddenException('Obra no encontrada');

    const trabajador = await this.prisma.trabajador.findUnique({
      where: { userId: req.user.id },
      select: { id: true },
    });

    if (!trabajador || trabajador.id !== proyecto.prevencionistaId) {
      throw new ForbiddenException(
        'No eres el encargado de asistencia (prevencionista) de esta obra',
      );
    }

    return true;
  }
}
