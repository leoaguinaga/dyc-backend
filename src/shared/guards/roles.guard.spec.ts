import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';
import {
  MODULO_KEY,
  NIVEL_MODULO_KEY,
} from '../decorators/modulo.decorator.js';
import { fn } from '../../testing/mocks.js';

function contexto(
  meta: Record<string, unknown>,
  user?: { id: string; role: string },
  method = 'GET',
) {
  const handler = () => undefined;
  class Controlador {}
  for (const [k, v] of Object.entries(meta))
    Reflect.defineMetadata(k, v, handler);
  return {
    getHandler: () => handler,
    getClass: () => Controlador,
    switchToHttp: () => ({ getRequest: () => ({ user, method }) }),
  } as unknown as ExecutionContext;
}

function setup(excepcion: string | null = null, permiso = false) {
  const rbac = {
    nivelExcepcion: fn(() => Promise.resolve(excepcion)),
    hasAnyPermission: fn(() => Promise.resolve(permiso)),
  };
  return { rbac, guard: new RolesGuard(new Reflector(), rbac as never) };
}

const LOG = { id: 'u1', role: 'logistica' };

describe('RolesGuard', () => {
  it('deja pasar endpoints públicos y a admin_ti', async () => {
    const { guard } = setup();
    expect(await guard.canActivate(contexto({ [IS_PUBLIC_KEY]: true }))).toBe(
      true,
    );
    expect(
      await guard.canActivate(
        contexto({ [ROLES_KEY]: ['gerencia'] }, { id: 't', role: 'admin_ti' }),
      ),
    ).toBe(true);
  });

  it('sin @Roles deja pasar a cualquier autenticado', async () => {
    const { guard } = setup();
    expect(await guard.canActivate(contexto({}, LOG))).toBe(true);
  });

  it('con @Roles exige que el rol esté en la lista', async () => {
    const { guard } = setup();
    expect(
      await guard.canActivate(contexto({ [ROLES_KEY]: ['logistica'] }, LOG)),
    ).toBe(true);
    expect(
      await guard.canActivate(contexto({ [ROLES_KEY]: ['gerencia'] }, LOG)),
    ).toBe(false);
    expect(
      await guard.canActivate(contexto({ [ROLES_KEY]: ['gerencia'] })),
    ).toBe(false);
  });

  it('con @Permissions consulta el permiso en vez de los roles', async () => {
    const { guard, rbac } = setup(null, true);
    const ok = await guard.canActivate(
      contexto(
        { [ROLES_KEY]: ['gerencia'], [PERMISSIONS_KEY]: ['users.manage'] },
        LOG,
      ),
    );
    expect(ok).toBe(true);
    expect(rbac.hasAnyPermission).toHaveBeenCalledWith('logistica', [
      'users.manage',
    ]);
  });

  it('sin excepción en el módulo, manda @Roles', async () => {
    const { guard } = setup(null);
    expect(
      await guard.canActivate(
        contexto({ [MODULO_KEY]: 'clientes', [ROLES_KEY]: ['gerencia'] }, LOG),
      ),
    ).toBe(false);
  });

  it('una excepción "ver" permite leer aunque @Roles no incluya al rol', async () => {
    const { guard } = setup('ver');
    expect(
      await guard.canActivate(
        contexto(
          { [MODULO_KEY]: 'reportes', [ROLES_KEY]: ['gerencia'] },
          LOG,
          'GET',
        ),
      ),
    ).toBe(true);
  });

  it('una excepción "ver" bloquea escrituras con mensaje de solo lectura', async () => {
    const { guard } = setup('ver');
    await expect(
      guard.canActivate(
        contexto(
          { [MODULO_KEY]: 'clientes', [ROLES_KEY]: ['logistica'] },
          LOG,
          'POST',
        ),
      ),
    ).rejects.toThrow(
      new ForbiddenException('Tu acceso a Clientes es de solo lectura'),
    );
  });

  it('una excepción "ninguno" bloquea incluso endpoints sin @Roles', async () => {
    const { guard } = setup('ninguno');
    await expect(
      guard.canActivate(contexto({ [MODULO_KEY]: 'clientes' }, LOG)),
    ).rejects.toThrow('No tienes acceso a Clientes');
  });

  it('@NivelModulo("ver") permite un POST de consulta con acceso de lectura', async () => {
    const { guard } = setup('ver');
    const ctx = contexto(
      {
        [MODULO_KEY]: 'reportes',
        [NIVEL_MODULO_KEY]: 'ver',
        [ROLES_KEY]: ['gerencia'],
      },
      LOG,
      'POST',
    );
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('@SinModulo (null) ignora las excepciones', async () => {
    const { guard, rbac } = setup('ninguno');
    expect(await guard.canActivate(contexto({ [MODULO_KEY]: null }, LOG))).toBe(
      true,
    );
    expect(rbac.nivelExcepcion).not.toHaveBeenCalled();
  });
});
