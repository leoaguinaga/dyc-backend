import 'reflect-metadata';
import { jest } from '@jest/globals';
import { CotizacionesService } from './cotizaciones.service.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Reflector } from '@nestjs/core';
import { CotizacionesController } from './cotizaciones.controller.js';
import { ROLES_KEY } from '../../shared/decorators/roles.decorator.js';
import { Role } from '../../prisma/types.js';
import { tiposCreablesPorRol } from '../../shared/alcance/tipos-creables.js';

// Invariantes de permisos del flujo de cotizaciones. Existen para detectar
// listas de roles desincronizadas (p. ej. un rol que crea requerimientos pero
// no puede aprobar su cotización) sin pruebas manuales por rol.

const reflector = new Reflector();
const proto = CotizacionesController.prototype as unknown as Record<
  string,
  () => unknown
>;

/** Roles efectivos de un handler, igual que RolesGuard (método > clase). */
function rolesDe(handler: string): Role[] {
  return (
    reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      proto[handler],
      CotizacionesController,
    ]) ?? []
  );
}

const TODOS_LOS_ROLES = Object.values(Role) as Role[];
const SOLICITANTES = TODOS_LOS_ROLES.filter(
  (r) => tiposCreablesPorRol(r).length > 0,
);

describe('permisos de cotizaciones', () => {
  it('detecta al menos un rol solicitante (sanity)', () => {
    expect(SOLICITANTES.length).toBeGreaterThan(0);
  });

  it.each(SOLICITANTES)(
    '%s (crea requerimientos) puede aprobar como solicitante',
    (rol) => {
      expect(rolesDe('aprobarSolicitante')).toContain(rol);
    },
  );

  it.each(SOLICITANTES)(
    '%s (crea requerimientos) puede abrir el detalle de su solicitud',
    (rol) => {
      expect(rolesDe('findOne')).toContain(rol);
    },
  );

  it('solo gerencia/administración aprueban por gerencia', () => {
    expect([...rolesDe('aprobarGerencia')].sort()).toEqual(
      ['administrador', 'gerencia'].sort(),
    );
  });

  it('el botón del dashboard coincide con los roles del endpoint aprobar-solicitante', () => {
    const src = readFileSync(
      join(
        process.cwd(),
        '../dashboard/app/(dashboard)/cotizaciones/[id]/components/SolicitudActions.tsx',
      ),
      'utf8',
    );
    const bloque = /seleccionada:\s*\{[\s\S]*?rolesPermitidos:\s*\[([\s\S]*?)\]/.exec(
      src,
    );
    expect(bloque).not.toBeNull();
    const dashboard = [...bloque![1].matchAll(/'([a-z_]+)'/g)]
      .map((m) => m[1])
      .sort();
    expect(dashboard).toEqual([...rolesDe('aprobarSolicitante')].sort());
  });
});

describe('detalle de solicitud para solicitantes sin acceso general', () => {
  const prisma = {
    solicitudCotizacion: { findUnique: jest.fn() },
    requerimiento: { findUnique: jest.fn() },
  };
  const service = new CotizacionesService(
    prisma as never,
    { emit: jest.fn() } as never,
    {} as never,
  );

  beforeEach(() => {
    prisma.solicitudCotizacion.findUnique
      .mockReset()
      .mockResolvedValue({ id: 's1', requerimientoId: 'r1' } as never);
    prisma.requerimiento.findUnique
      .mockReset()
      .mockResolvedValue({ creadoPorId: 'u1' } as never);
  });

  it('el creador del requerimiento puede abrirlo', async () => {
    await expect(
      service.findOneSolicitud('s1', { id: 'u1', role: 'supervisor' }),
    ).resolves.toMatchObject({ id: 's1' });
  });

  it('otro supervisor no puede abrir solicitudes ajenas', async () => {
    await expect(
      service.findOneSolicitud('s1', { id: 'u2', role: 'supervisor' }),
    ).rejects.toThrow('propios requerimientos');
  });

  it('logística no se restringe', async () => {
    await expect(
      service.findOneSolicitud('s1', { id: 'u2', role: 'logistica' }),
    ).resolves.toMatchObject({ id: 's1' });
  });
});
