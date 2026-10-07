import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '../../../prisma/generated/prisma/client.js';
import type { Role } from '../../prisma/types.js';

// Roles cuyo alcance depende de las obras a las que están asignados
// (ProyectoSupervisor). Solo trabajan sobre esas obras: las ven, toman su
// asistencia y revisan técnicamente lo que se pide para ellas. La asignación se
// administra desde la ficha de la obra (sección "Supervisores").
export const ROLES_ASIGNADOS_A_PROYECTO: Role[] = ['coordinador_ssoma'];

export function requiereAsignacion(role: Role): boolean {
  return ROLES_ASIGNADOS_A_PROYECTO.includes(role);
}

/** Filtro Prisma que deja solo las obras donde el usuario está asignado. */
export function obraAsignadaA(userId: string): Prisma.ProyectoWhereInput {
  return { supervisores: { some: { userId } } };
}

interface AsignacionesDb {
  proyectoSupervisor: {
    findUnique(args: {
      where: { proyectoId_userId: { proyectoId: string; userId: string } };
      select: { userId: true };
    }): Promise<{ userId: string } | null>;
  };
}

export async function estaAsignadoAProyecto(
  prisma: AsignacionesDb,
  userId: string,
  proyectoId: string,
): Promise<boolean> {
  const asignacion = await prisma.proyectoSupervisor.findUnique({
    where: { proyectoId_userId: { proyectoId, userId } },
    select: { userId: true },
  });
  return asignacion !== null;
}

/**
 * Corta con 403 si el rol trabaja por asignación y el usuario no está asignado
 * a la obra. Los demás roles pasan: su alcance lo definen sus propias reglas.
 */
export async function exigirAsignacionSiAplica(
  prisma: AsignacionesDb,
  userId: string,
  role: Role,
  proyectoId: string,
): Promise<void> {
  if (!requiereAsignacion(role)) return;
  if (await estaAsignadoAProyecto(prisma, userId, proyectoId)) return;
  throw new ForbiddenException('No estás asignado a esta obra');
}
