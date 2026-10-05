import { BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ModulosAccesoController } from './modulos-acceso.controller.js';
import { RbacController } from './rbac.controller.js';
import { SetNivelModuloDto } from './dto/set-nivel-modulo.dto.js';
import { serviceMock } from '../../testing/mocks.js';

const req = {
  user: { id: 'ti', role: 'admin_ti', name: 'TI', email: 'ti@x' },
} as never;

describe('ModulosAccesoController', () => {
  const rbac = serviceMock();
  const controller = new ModulosAccesoController(rbac as never);

  it('delega lecturas y escrituras al servicio con el editor actual', () => {
    void controller.mios(req);
    expect(rbac.misModulos).toHaveBeenCalledWith('ti', 'admin_ti');
    void controller.matriz();
    expect(rbac.matriz).toHaveBeenCalled();
    void controller.accesosUsuario('u1');
    expect(rbac.accesosUsuario).toHaveBeenCalledWith('u1');
    void controller.setNivelRol('pagos', 'logistica', { nivel: 'ver' }, req);
    expect(rbac.setNivelRol).toHaveBeenCalledWith(
      'pagos',
      'logistica',
      'ver',
      'ti',
    );
    void controller.setNivelUsuario('pagos', 'u1', { nivel: null }, req);
    expect(rbac.setNivelUsuario).toHaveBeenCalledWith(
      'pagos',
      'u1',
      null,
      'ti',
    );
  });

  it('rechaza roles que no existen', () => {
    expect(() =>
      controller.setNivelRol('pagos', 'jefe', { nivel: 'ver' }, req),
    ).toThrow(BadRequestException);
  });
});

describe('RbacController', () => {
  it('delega permisos por código', () => {
    const rbac = serviceMock();
    const controller = new RbacController(rbac as never);
    void controller.list();
    void controller.setRoles('users.manage', {
      roles: ['gerencia'],
      description: 'x',
    });
    expect(rbac.setRoles).toHaveBeenCalledWith(
      'users.manage',
      ['gerencia'],
      'x',
    );
  });
});

describe('SetNivelModuloDto', () => {
  const errores = (nivel: unknown) =>
    validate(plainToInstance(SetNivelModuloDto, { nivel }));

  it('acepta niveles válidos y null', async () => {
    expect(await errores('ver')).toHaveLength(0);
    expect(await errores('ninguno')).toHaveLength(0);
    expect(await errores(null)).toHaveLength(0);
  });

  it('rechaza valores fuera del catálogo', async () => {
    expect(await errores('admin')).not.toHaveLength(0);
  });
});
