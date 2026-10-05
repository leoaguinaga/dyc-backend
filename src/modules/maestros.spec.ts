import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { TrabajadoresService } from './trabajadores/trabajadores.service.js';
import { UsersService } from './users/users.service.js';
import { CobrosService } from './cobros/cobros.service.js';
import { ClientesService } from './clientes/clientes.service.js';
import { InventarioService } from './inventario/inventario.service.js';
import { AlmacenesService } from './almacenes/almacenes.service.js';
import { AyudaService } from './ayuda/ayuda.service.js';
import { hoyLima } from '../shared/date/fecha.util.js';
import { fn, prismaMock, type PrismaMock } from '../testing/mocks.js';

const DIA = 86_400_000;

describe('TrabajadoresService', () => {
  function setup(signUp: unknown = { user: { id: 'nuevo-user' } }) {
    const prisma: PrismaMock = prismaMock();
    const signUpEmail = fn(() => Promise.resolve(signUp));
    const auth = { auth: { api: { signUpEmail } } };
    return {
      prisma,
      signUpEmail,
      service: new TrabajadoresService(prisma as never, auth as never),
    };
  }

  it('crea un trabajador sin acceso o con cuenta y rol', async () => {
    const { service, prisma, signUpEmail } = setup();
    await service.create({ nombre: 'Luis', dni: '1' });
    expect(prisma.trabajador.create).toHaveBeenLastCalledWith({
      data: { nombre: 'Luis', dni: '1' },
    });
    await service.create({
      nombre: 'Ana',
      email: 'ana@dyc.cl',
      crearUsuario: true,
      role: 'logistica',
      password: 'Clave123!',
    } as never);
    expect(signUpEmail).toHaveBeenCalledWith({
      body: { email: 'ana@dyc.cl', password: 'Clave123!', name: 'Ana' },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'nuevo-user' },
      data: { role: 'logistica' },
    });
    expect(prisma.trabajador.create.mock.calls[1][0].data).toEqual({
      nombre: 'Ana',
      email: 'ana@dyc.cl',
      userId: 'nuevo-user',
    });
  });

  it('exige email, rol y contraseña para crear acceso', async () => {
    const { service } = setup();
    await expect(
      service.create({ nombre: 'A', crearUsuario: true } as never),
    ).rejects.toThrow(/Email requerido/);
    await expect(
      service.create({
        nombre: 'A',
        email: 'a@x',
        crearUsuario: true,
      } as never),
    ).rejects.toThrow(/Rol requerido/);
    await expect(
      service.create({
        nombre: 'A',
        email: 'a@x',
        role: 'pdr',
        crearUsuario: true,
      } as never),
    ).rejects.toThrow(/Contraseña requerida/);
    const sinCuenta = setup(null);
    await expect(
      sinCuenta.service.create({
        nombre: 'A',
        email: 'a@x',
        role: 'pdr',
        password: 'x',
        crearUsuario: true,
      } as never),
    ).rejects.toThrow(/Error al crear la cuenta/);
  });

  it('crearAcceso no duplica cuentas y vincula el usuario', async () => {
    const { service, prisma } = setup();
    await expect(service.crearAcceso('t1', {} as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    prisma.trabajador.findUnique.mockResolvedValueOnce({
      id: 't1',
      userId: 'ya',
    });
    await expect(service.crearAcceso('t1', {} as never)).rejects.toThrow(
      /ya tiene acceso/,
    );
    prisma.trabajador.findUnique.mockResolvedValueOnce({
      id: 't1',
      nombre: 'Luis',
      userId: null,
    });
    await service.crearAcceso('t1', {
      email: 'l@x',
      password: 'p',
      role: 'pdr',
    } as never);
    expect(prisma.trabajador.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { userId: 'nuevo-user' } }),
    );
    const fallo = setup(null);
    fallo.prisma.trabajador.findUnique.mockResolvedValueOnce({
      id: 't1',
      nombre: 'Luis',
      userId: null,
    });
    await expect(
      fallo.service.crearAcceso('t1', {
        email: 'l@x',
        password: 'p',
        role: 'pdr',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('actualiza, desactiva, asigna obras y perfil de obrero solo si existe', async () => {
    const { service, prisma } = setup();
    await service.findAll();
    await expect(service.update('t1', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    prisma.trabajador.findUnique.mockResolvedValue({ id: 't1' });
    await service.findOne('t1');
    await service.update('t1', { cargo: 'Operario' });
    await service.softDelete('t1');
    expect(prisma.trabajador.update).toHaveBeenLastCalledWith({
      where: { id: 't1' },
      data: { activo: false },
    });
    await service.asignarProyecto('t1', {
      proyectoId: 'p1',
      fechaIngreso: '2026-09-01',
      fechaSalida: '2026-12-31',
    });
    expect(prisma.proyectoTrabajador.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ fechaSalida: new Date('2026-12-31') }),
    );
    await service.asignarProyecto('t1', {
      proyectoId: 'p1',
      fechaIngreso: '2026-09-01',
    });
    expect(
      prisma.proyectoTrabajador.create.mock.calls[1][0].data,
    ).not.toHaveProperty('fechaSalida');
    await service.desasignarProyecto('t1', 'p1');
    await service.upsertPerfilObrero('t1', { precioHora: 12 });
    expect(prisma.perfilObrero.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { trabajadorId: 't1' } }),
    );
  });
});

describe('UsersService', () => {
  function setup() {
    const prisma: PrismaMock = prismaMock();
    const internalAdapter = {
      findAccounts: fn(() =>
        Promise.resolve([
          { id: 'acc-google', providerId: 'google' },
          { id: 'acc-1', providerId: 'credential', password: 'hash' },
        ]),
      ),
      updateAccount: fn(() => Promise.resolve()),
    };
    const ctx = {
      internalAdapter,
      password: { hash: fn((p: string) => Promise.resolve(`hash(${p})`)) },
    };
    const auth = { auth: { $context: Promise.resolve(ctx) } };
    return {
      prisma,
      internalAdapter,
      service: new UsersService(prisma as never, auth as never),
    };
  }

  it('findOne aplana el cargo del trabajador', async () => {
    const { service, prisma } = setup();
    await expect(service.findOne('x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      name: 'Ana',
      trabajador: { cargo: 'Arquitecto' },
    });
    expect(await service.findOne('u1')).toEqual({
      id: 'u1',
      name: 'Ana',
      cargo: 'Arquitecto',
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      name: 'Ana',
      trabajador: null,
    });
    expect((await service.findOne('u1')).cargo).toBeNull();
    await service.findAll();
  });

  it('la actividad reúne conteos y las 20 acciones más recientes', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', trabajador: null });
    prisma.user.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 'u1' })
      .mockResolvedValueOnce({ _count: { requerimientos: 2 } });
    const f = (n: number) => new Date(2026, 8, n);
    prisma.requerimiento.findMany.mockResolvedValue([
      { id: 'r1', codigo: 'RQ-1', nombre: 'Cemento', creadoEn: f(1) },
    ]);
    prisma.compraSimple.findMany.mockResolvedValue([
      { id: 'c1', codigo: 'CS-1', nombre: 'EPP', creadoEn: f(2) },
    ]);
    prisma.ordenCompra.findMany.mockResolvedValue([
      { id: 'o1', numero: 'OC-1', creadoEn: f(3) },
    ]);
    prisma.pago.findMany
      .mockResolvedValueOnce([
        { id: 'p1', concepto: 'Alquiler', creadoEn: f(4) },
      ])
      .mockResolvedValueOnce([{ id: 'p2', concepto: null, creadoEn: f(5) }]);
    prisma.cobro.findMany.mockResolvedValue([
      { id: 'co', creadoEn: f(6), proyecto: { nombre: 'Obra' } },
    ]);
    prisma.comprobante.findMany.mockResolvedValue([
      { id: 'cp', numero: 'CP-1', creadoEn: f(7) },
    ]);
    prisma.turno.findMany
      .mockResolvedValueOnce([
        { id: 't1', creadoEn: f(8), proyecto: { nombre: 'Obra' } },
      ])
      .mockResolvedValueOnce([
        { id: 't2', creadoEn: f(9), proyecto: { nombre: 'Obra' } },
      ]);
    prisma.planilla.findMany.mockResolvedValue([
      { id: 'pl', generadaEn: f(10), proyecto: { nombre: 'Obra' } },
    ]);
    const r = await service.findActivity('u1');
    expect(r.counts).toEqual({ requerimientos: 2 });
    expect(r.actividadReciente.map((a) => a.tipo)).toEqual([
      'planilla',
      'turno_cerrado',
      'turno_abierto',
      'comprobante',
      'cobro',
      'pago_ejecutado',
      'pago_registrado',
      'orden_compra',
      'compra_simple',
      'requerimiento',
    ]);
    expect(
      r.actividadReciente.find((a) => a.tipo === 'pago_ejecutado')?.etiqueta,
    ).toBe('Ejecutó pago');
  });

  it('auditoría paginada y actualización', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', trabajador: null });
    prisma.auditLog.count.mockResolvedValue(120);
    expect(await service.findAuditLog('u1', 3, 50)).toEqual({
      items: [],
      total: 120,
      page: 3,
      pageSize: 50,
    });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 100, take: 50 }),
    );
    await service.update('u1', { name: 'Ana' });
  });

  it('cambia la contraseña de la cuenta de credenciales', async () => {
    const { service, prisma, internalAdapter } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', trabajador: null });
    await service.changePassword('u1', 'Nueva123!');
    expect(internalAdapter.updateAccount).toHaveBeenCalledWith('acc-1', {
      password: 'hash(Nueva123!)',
    });
    await service.changeOwnPassword('u1', 'Otra123!');
    internalAdapter.findAccounts.mockResolvedValueOnce([
      { id: 'g', providerId: 'google' },
    ]);
    await expect(service.changeOwnPassword('u1', 'x')).rejects.toThrow(
      /Cuenta de credenciales no encontrada/,
    );
  });
});

describe('CobrosService', () => {
  const hoy = hoyLima();
  function setup() {
    const prisma: PrismaMock = prismaMock();
    return { prisma, service: new CobrosService(prisma as never) };
  }

  it('calcula el estado vencido en lectura y filtra por él', async () => {
    const { service, prisma } = setup();
    prisma.cobro.findMany.mockResolvedValue([
      {
        id: 'a',
        estado: 'pendiente',
        fechaProgramada: new Date(hoy.getTime() - DIA),
      },
      {
        id: 'b',
        estado: 'pendiente',
        fechaProgramada: new Date(hoy.getTime() + DIA),
      },
      {
        id: 'c',
        estado: 'cobrado',
        fechaProgramada: new Date(hoy.getTime() - DIA),
      },
    ]);
    expect((await service.findAll({})).map((c) => c.estadoEfectivo)).toEqual([
      'vencido',
      'pendiente',
      'cobrado',
    ]);
    expect(
      (await service.findAll({ estado: 'vencido' } as never)).map((c) => c.id),
    ).toEqual(['a']);
    await service.findAll({ estado: 'cobrado' } as never);
    expect(prisma.cobro.findMany.mock.calls[2][0].where.estado).toBe('cobrado');
  });

  it('marca cobrado solo lo pendiente', async () => {
    const { service, prisma } = setup();
    await expect(service.findOne('x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    prisma.cobro.findUnique.mockResolvedValueOnce({
      id: 'a',
      estado: 'cobrado',
      fechaProgramada: hoy,
    });
    await expect(service.marcarCobrado('a', {}, 'u1')).rejects.toThrow(
      /en estado "cobrado"/,
    );
    prisma.cobro.findUnique.mockResolvedValueOnce({
      id: 'a',
      estado: 'pendiente',
      fechaProgramada: hoy,
    });
    prisma.cobro.update.mockResolvedValue({
      id: 'a',
      estado: 'cobrado',
      fechaProgramada: hoy,
    });
    await service.marcarCobrado('a', { fechaCobrada: '2026-09-30' }, 'u1');
    expect(prisma.cobro.update.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        estado: 'cobrado',
        cobradoPorId: 'u1',
        fechaCobrada: new Date('2026-09-30'),
      }),
    );
    prisma.cobro.findUnique.mockResolvedValueOnce({
      id: 'a',
      estado: 'pendiente',
      fechaProgramada: hoy,
    });
    await service.marcarCobrado('a', {}, 'u1');
  });

  it('resume pendiente, vencido, próximo y cobrado del mes', async () => {
    const { service, prisma } = setup();
    const ahora = new Date();
    prisma.cobro.findMany.mockResolvedValue([
      {
        estado: 'pendiente',
        monto: '100',
        fechaProgramada: new Date(ahora.getTime() - DIA),
        fechaCobrada: null,
      },
      {
        estado: 'pendiente',
        monto: '50',
        fechaProgramada: new Date(ahora.getTime() + 2 * DIA),
        fechaCobrada: null,
      },
      {
        estado: 'pendiente',
        monto: '10',
        fechaProgramada: new Date(ahora.getTime() + 30 * DIA),
        fechaCobrada: null,
      },
      {
        estado: 'cobrado',
        monto: '500',
        fechaProgramada: ahora,
        fechaCobrada: ahora,
      },
    ]);
    expect(await service.resumen()).toEqual({
      totalPendiente: 160,
      totalVencido: 100,
      proximos7dias: 50,
      cobradoMes: 500,
    });
  });
});

describe('Clientes, inventario, almacenes y ayuda', () => {
  it('ClientesService valida existencia antes de escribir', async () => {
    const prisma = prismaMock();
    const service = new ClientesService(prisma as never);
    await service.findAll();
    await service.create({ razonSocial: 'X' });
    await service.findContactos('c1');
    await expect(service.update('c1', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.updateContacto('c1', 'k', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    prisma.cliente.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.contactoCliente.findFirst.mockResolvedValue({ id: 'k' });
    await service.update('c1', { razonSocial: 'Y' });
    await service.createContacto('c1', { nombre: 'Luis' });
    expect(prisma.contactoCliente.create).toHaveBeenCalledWith({
      data: { nombre: 'Luis', clienteId: 'c1' },
    });
    await service.updateContacto('c1', 'k', { cargo: 'x' });
  });

  it('InventarioService no permite códigos duplicados', async () => {
    const prisma = prismaMock();
    const service = new InventarioService(prisma as never);
    await service.findAll({ q: 'cem' });
    expect(
      prisma.itemInventario.findMany.mock.calls[0][0].where.OR,
    ).toHaveLength(2);
    await service.findAll({});
    prisma.itemInventario.findUnique.mockResolvedValueOnce({ id: 'otro' });
    await expect(
      service.create({ codigo: 'C-1' } as never),
    ).rejects.toBeInstanceOf(ConflictException);
    await service.create({ codigo: 'C-2' } as never);
    await expect(service.findOne('x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    prisma.itemInventario.findUnique.mockResolvedValue({ id: 'i1' });
    prisma.itemInventario.findFirst.mockResolvedValueOnce({ id: 'i2' });
    await expect(service.update('i1', { codigo: 'C-1' })).rejects.toThrow(
      /ya existe/,
    );
    await service.update('i1', { codigo: 'C-9' });
    await service.update('i1', { nombre: 'Cemento' });
    expect(prisma.itemInventario.update).toHaveBeenCalledTimes(2);
  });

  it('AlmacenesService crea fijos por defecto', async () => {
    const prisma = prismaMock();
    const service = new AlmacenesService(prisma as never);
    await service.findAll();
    await service.create({ nombre: 'Central' });
    expect(prisma.almacen.create.mock.calls[0][0].data.tipo).toBe('fijo');
    await expect(service.update('a1', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    prisma.almacen.findUnique.mockResolvedValue({ id: 'a1' });
    await service.update('a1', { nombre: 'Norte' });
  });

  it('AyudaService filtra videos por rol salvo admin_ti', async () => {
    const prisma = prismaMock();
    const service = new AyudaService(prisma as never);
    await service.findAllForRole('pdr');
    expect(prisma.helpVideo.findMany.mock.calls[0][0].where).toEqual({
      roles: { has: 'pdr' },
    });
    await service.findAllForRole('admin_ti');
    expect(prisma.helpVideo.findMany.mock.calls[1][0].where).toEqual({});
    await service.create({ titulo: 'x' } as never, 'u1');
    await expect(service.update('v', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.remove('v')).rejects.toBeInstanceOf(NotFoundException);
    prisma.helpVideo.findUnique.mockResolvedValue({ id: 'v' });
    await service.update('v', { titulo: 'y' });
    await service.remove('v');
    expect(prisma.helpVideo.delete).toHaveBeenCalledWith({
      where: { id: 'v' },
    });
  });
});
