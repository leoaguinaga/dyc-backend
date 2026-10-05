import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RbacService } from './rbac.service.js';
import type { RutaModulo, RutasModuloService } from './rutas-modulo.service.js';
import {
  esModulo,
  nivelAlcanza,
  nivelPorMetodo,
  etiquetaModulo,
} from './modulos.js';
import { prismaMock, type PrismaMock } from '../../testing/mocks.js';

const RUTAS: RutaModulo[] = [
  {
    modulo: 'clientes',
    ruta: 'GET /clientes',
    nivel: 'ver',
    roles: ['administrador', 'logistica', 'supervisor'],
    permisos: null,
  },
  {
    modulo: 'clientes',
    ruta: 'POST /clientes',
    nivel: 'editar',
    roles: ['administrador', 'logistica'],
    permisos: null,
  },
  {
    modulo: 'clientes',
    ruta: 'DELETE /clientes/:id',
    nivel: 'editar',
    roles: ['administrador'],
    permisos: null,
  },
  {
    modulo: 'reportes',
    ruta: 'GET /reportes',
    nivel: 'ver',
    roles: null,
    permisos: null,
  },
  {
    modulo: 'usuarios',
    ruta: 'GET /users',
    nivel: 'ver',
    roles: ['administrador'],
    permisos: ['users.manage'],
  },
];

function setup(
  filas: {
    modulo: string;
    role: string | null;
    userId: string | null;
    nivel: string;
  }[] = [],
) {
  const prisma: PrismaMock = prismaMock();
  prisma.moduloAcceso.findMany.mockResolvedValue(filas);
  prisma.rolePermission.findMany.mockResolvedValue([
    { role: 'gerencia', permission: { code: 'users.manage' } },
  ]);
  const rutas = { listar: () => RUTAS } as unknown as RutasModuloService;
  return { prisma, service: new RbacService(prisma as never, rutas) };
}

describe('modulos (helpers)', () => {
  it('editar implica ver y ninguno no alcanza nada', () => {
    expect(nivelAlcanza('editar', 'ver')).toBe(true);
    expect(nivelAlcanza('ver', 'editar')).toBe(false);
    expect(nivelAlcanza('ninguno', 'ver')).toBe(false);
  });

  it('GET y HEAD piden ver; el resto pide editar', () => {
    expect(nivelPorMetodo('GET')).toBe('ver');
    expect(nivelPorMetodo('HEAD')).toBe('ver');
    expect(nivelPorMetodo('POST')).toBe('editar');
    expect(nivelPorMetodo('DELETE')).toBe('editar');
  });

  it('reconoce módulos del catálogo y su etiqueta', () => {
    expect(esModulo('pagos')).toBe(true);
    expect(esModulo('inexistente')).toBe(false);
    expect(etiquetaModulo('ordenes')).toBe('Órdenes de compra/servicio');
  });
});

describe('RbacService — acceso por defecto', () => {
  const { service } = setup();
  const permisos = new Map([['users.manage', new Set(['gerencia' as const])]]);

  it('editar completo cuando el rol llega a todos los endpoints', () => {
    expect(
      service.accesoPorDefecto('administrador', 'clientes', permisos),
    ).toEqual({ nivel: 'editar', parcial: false });
  });

  it('editar parcial cuando solo llega a algunas escrituras', () => {
    expect(service.accesoPorDefecto('logistica', 'clientes', permisos)).toEqual(
      { nivel: 'editar', parcial: true },
    );
  });

  it('ver cuando solo llega a lecturas', () => {
    expect(
      service.accesoPorDefecto('supervisor', 'clientes', permisos),
    ).toEqual({ nivel: 'ver', parcial: false });
  });

  it('ninguno cuando no llega a nada', () => {
    expect(service.accesoPorDefecto('pdr', 'clientes', permisos)).toEqual({
      nivel: 'ninguno',
      parcial: false,
    });
  });

  it('un endpoint sin @Roles lo alcanza cualquier rol', () => {
    expect(service.accesoPorDefecto('pdr', 'reportes', permisos).nivel).toBe(
      'ver',
    );
  });

  it('con @Permissions mandan los roles del permiso, no los de @Roles', () => {
    expect(
      service.accesoPorDefecto('gerencia', 'usuarios', permisos).nivel,
    ).toBe('ver');
    expect(
      service.accesoPorDefecto('administrador', 'usuarios', permisos).nivel,
    ).toBe('ninguno');
  });

  it('admin_ti siempre edita', () => {
    expect(service.accesoPorDefecto('admin_ti', 'clientes', permisos)).toEqual({
      nivel: 'editar',
      parcial: false,
    });
  });
});

describe('RbacService — excepciones', () => {
  it('la excepción del usuario gana sobre la de su rol', async () => {
    const { service } = setup([
      { modulo: 'clientes', role: 'logistica', userId: null, nivel: 'ninguno' },
      { modulo: 'clientes', role: null, userId: 'u1', nivel: 'editar' },
    ]);
    expect(await service.nivelExcepcion('u1', 'logistica', 'clientes')).toBe(
      'editar',
    );
    expect(await service.nivelExcepcion('u2', 'logistica', 'clientes')).toBe(
      'ninguno',
    );
    expect(
      await service.nivelExcepcion('u2', 'gerencia', 'clientes'),
    ).toBeNull();
  });

  it('cachea las excepciones entre llamadas', async () => {
    const { service, prisma } = setup();
    await service.nivelExcepcion('u1', 'logistica', 'clientes');
    await service.nivelExcepcion('u1', 'logistica', 'pagos');
    expect(prisma.moduloAcceso.findMany).toHaveBeenCalledTimes(1);
  });

  it('misModulos devuelve null en todo para admin_ti', async () => {
    const { service } = setup([
      { modulo: 'clientes', role: 'admin_ti', userId: null, nivel: 'ninguno' },
    ]);
    const mios = await service.misModulos('u1', 'admin_ti');
    expect(Object.values(mios).every((v) => v === null)).toBe(true);
  });

  it('misModulos refleja la excepción del rol', async () => {
    const { service } = setup([
      { modulo: 'pagos', role: 'logistica', userId: null, nivel: 'ver' },
    ]);
    const mios = await service.misModulos('u1', 'logistica');
    expect(mios.pagos).toBe('ver');
    expect(mios.clientes).toBeNull();
  });
});

describe('RbacService — matriz y escrituras', () => {
  it('la matriz tiene una celda por módulo y rol configurable', async () => {
    const { service } = setup([
      { modulo: 'clientes', role: 'logistica', userId: null, nivel: 'ver' },
    ]);
    const matriz = await service.matriz();
    expect(matriz.celdas).toHaveLength(
      matriz.modulos.length * matriz.roles.length,
    );
    expect(matriz.roles).not.toContain('admin_ti');
    const celda = matriz.celdas.find(
      (c) => c.modulo === 'clientes' && c.role === 'logistica',
    );
    expect(celda).toEqual(
      expect.objectContaining({
        excepcion: 'ver',
        porDefecto: { nivel: 'editar', parcial: true },
      }),
    );
  });

  it('setNivelRol guarda con upsert e invalida la caché', async () => {
    const { service, prisma } = setup();
    await service.nivelExcepcion('u1', 'logistica', 'clientes');
    await service.setNivelRol('clientes', 'logistica', 'ver', 'editor');
    expect(prisma.moduloAcceso.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { modulo_role: { modulo: 'clientes', role: 'logistica' } },
        create: expect.objectContaining({
          nivel: 'ver',
          actualizadoPorId: 'editor',
        }),
      }),
    );
    expect(prisma.moduloAcceso.findMany).toHaveBeenCalledTimes(2);
  });

  it('setNivelRol con null borra la excepción', async () => {
    const { service, prisma } = setup();
    await service.setNivelRol('clientes', 'logistica', null, 'editor');
    expect(prisma.moduloAcceso.deleteMany).toHaveBeenCalledWith({
      where: { modulo: 'clientes', role: 'logistica' },
    });
  });

  it('rechaza módulos desconocidos y roles fuera de la matriz', async () => {
    const { service } = setup();
    await expect(
      service.setNivelRol('foo', 'logistica', 'ver', 'e'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setNivelRol('clientes', 'admin_ti', 'ver', 'e'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('setNivelUsuario guarda la excepción y devuelve los accesos del usuario', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'logistica' });
    const accesos = await service.setNivelUsuario(
      'reportes',
      'u1',
      'ver',
      'editor',
    );
    expect(prisma.moduloAcceso.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { modulo_userId: { modulo: 'reportes', userId: 'u1' } },
      }),
    );
    expect(accesos.userId).toBe('u1');
    expect(
      accesos.modulos.find((m) => m.modulo === 'clientes')?.segunRol,
    ).toEqual({ nivel: 'editar', parcial: true });
  });

  it('setNivelUsuario con null borra y valida usuario', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.setNivelUsuario('reportes', 'x', 'ver', 'e'),
    ).rejects.toBeInstanceOf(NotFoundException);
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'logistica' });
    await service.setNivelUsuario('reportes', 'u1', null, 'e');
    expect(prisma.moduloAcceso.deleteMany).toHaveBeenCalledWith({
      where: { modulo: 'reportes', userId: 'u1' },
    });
  });

  it('no permite excepciones para admin_ti', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: 'ti', role: 'admin_ti' });
    await expect(
      service.setNivelUsuario('reportes', 'ti', 'ver', 'e'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accesosUsuario marca acceso total para admin_ti y usa la excepción del rol como base', async () => {
    const { service, prisma } = setup([
      { modulo: 'clientes', role: 'logistica', userId: null, nivel: 'ninguno' },
    ]);
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'ti',
      role: 'admin_ti',
    });
    expect((await service.accesosUsuario('ti')).accesoTotal).toBe(true);
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      role: 'logistica',
    });
    const clientes = (await service.accesosUsuario('u1')).modulos.find(
      (m) => m.modulo === 'clientes',
    );
    expect(clientes).toEqual(
      expect.objectContaining({
        excepcionRol: 'ninguno',
        segunRol: { nivel: 'ninguno', parcial: false },
      }),
    );
  });
});

describe('RbacService — permisos por código', () => {
  it('admin_ti siempre tiene permiso; el resto según role_permissions', async () => {
    const { service, prisma } = setup();
    expect(await service.hasAnyPermission('admin_ti', ['x'])).toBe(true);
    prisma.rolePermission.count.mockResolvedValue(1);
    expect(await service.hasAnyPermission('gerencia', ['users.manage'])).toBe(
      true,
    );
    prisma.rolePermission.count.mockResolvedValue(0);
    expect(await service.hasAnyPermission('logistica', ['users.manage'])).toBe(
      false,
    );
  });

  it('setRoles reemplaza los roles del permiso', async () => {
    const { service, prisma } = setup();
    prisma.permission.upsert.mockResolvedValue({ id: 'p1' });
    prisma.permission.findUniqueOrThrow.mockResolvedValue({
      id: 'p1',
      roles: [],
    });
    await service.setRoles('users.manage', ['gerencia'], 'desc');
    expect(prisma.rolePermission.deleteMany).toHaveBeenCalledWith({
      where: { permissionId: 'p1' },
    });
    expect(prisma.rolePermission.createMany).toHaveBeenCalledWith({
      data: [{ role: 'gerencia', permissionId: 'p1' }],
    });
    await service.list();
    expect(prisma.permission.findMany).toHaveBeenCalled();
  });
});
