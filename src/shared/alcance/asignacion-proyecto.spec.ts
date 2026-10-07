import { ForbiddenException } from '@nestjs/common';
import { fn } from '../../testing/mocks.js';
import {
  estaAsignadoAProyecto,
  exigirAsignacionSiAplica,
  obraAsignadaA,
  requiereAsignacion,
} from './asignacion-proyecto.js';

function prismaConAsignacion(asignado: boolean) {
  const findUnique = fn().mockResolvedValue(asignado ? { userId: 'u1' } : null);
  return { prisma: { proyectoSupervisor: { findUnique } }, findUnique };
}

describe('requiereAsignacion', () => {
  it('el coordinador SSOMA trabaja solo en sus obras asignadas', () => {
    expect(requiereAsignacion('coordinador_ssoma')).toBe(true);
  });

  it.each([
    'pdr',
    'jefe_sig',
    'tesoreria',
    'administrador',
    'gerencia',
    'admin_ti',
  ] as const)('"%s" no depende de la asignación', (rol) => {
    expect(requiereAsignacion(rol)).toBe(false);
  });
});

describe('obraAsignadaA', () => {
  it('filtra las obras donde el usuario figura como asignado', () => {
    expect(obraAsignadaA('u1')).toEqual({
      supervisores: { some: { userId: 'u1' } },
    });
  });
});

describe('estaAsignadoAProyecto', () => {
  it('consulta la asignación por obra y usuario', async () => {
    const { prisma, findUnique } = prismaConAsignacion(true);
    expect(await estaAsignadoAProyecto(prisma, 'u1', 'p1')).toBe(true);
    expect(findUnique).toHaveBeenCalledWith({
      where: { proyectoId_userId: { proyectoId: 'p1', userId: 'u1' } },
      select: { userId: true },
    });
  });

  it('es falso si no hay asignación', async () => {
    const { prisma } = prismaConAsignacion(false);
    expect(await estaAsignadoAProyecto(prisma, 'u1', 'p1')).toBe(false);
  });
});

describe('exigirAsignacionSiAplica', () => {
  it('deja pasar al coordinador asignado a la obra', async () => {
    const { prisma } = prismaConAsignacion(true);
    await expect(
      exigirAsignacionSiAplica(prisma, 'u1', 'coordinador_ssoma', 'p1'),
    ).resolves.toBeUndefined();
  });

  it('corta con 403 si el coordinador no está asignado', async () => {
    const { prisma } = prismaConAsignacion(false);
    await expect(
      exigirAsignacionSiAplica(prisma, 'u1', 'coordinador_ssoma', 'p2'),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      exigirAsignacionSiAplica(prisma, 'u1', 'coordinador_ssoma', 'p2'),
    ).rejects.toThrow('No estás asignado a esta obra');
  });

  it('no consulta nada para los roles que no trabajan por asignación', async () => {
    const { prisma, findUnique } = prismaConAsignacion(false);
    await exigirAsignacionSiAplica(prisma, 'u1', 'jefe_sig', 'p2');
    await exigirAsignacionSiAplica(prisma, 'u1', 'administrador', 'p2');
    expect(findUnique).not.toHaveBeenCalled();
  });
});
