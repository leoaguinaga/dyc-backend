import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { ComprasSimplesService } from './compras-simples.service.js';

describe('ComprasSimplesService hard delete', () => {
  const compra = {
    id: 'compra-1',
    codigo: 'CS-2026-0001',
    nombre: 'Compra de prueba',
    grupos: [
      {
        id: 'grupo-1',
        pagos: [
          { id: 'pago-1', estado: 'pagado' },
          { id: 'pago-2', estado: 'pendiente' },
        ],
        items: [{ id: 'item-1' }, { id: 'item-2' }],
        historial: [{ id: 'historial-1' }],
        archivos: [{ id: 'archivo-1', url: '/uploads/compras-simples/a.pdf' }],
      },
    ],
    notificaciones: [{ id: 'notificacion-1' }],
  };

  function setup(remainingGroups = 0) {
    const calls = {
      transactions: 0,
      deletedIds: [] as string[],
      checkedRelations: [] as string[],
      removedUrls: [] as string[],
    };
    const tx = {
      compraSimple: {
        findUnique: () => Promise.resolve(compra),
        delete: ({ where }: { where: { id: string } }) => {
          calls.deletedIds.push(where.id);
          return Promise.resolve(compra);
        },
        count: () => {
          calls.checkedRelations.push('compraSimple');
          return Promise.resolve(0);
        },
      },
      ordenCompra: {
        count: () => {
          calls.checkedRelations.push('ordenCompra');
          return Promise.resolve(remainingGroups);
        },
      },
      ordenCompraItem: {
        count: () => {
          calls.checkedRelations.push('ordenCompraItem');
          return Promise.resolve(0);
        },
      },
      pago: {
        count: () => {
          calls.checkedRelations.push('pago');
          return Promise.resolve(0);
        },
      },
      compraSimpleGrupoHistorial: {
        count: () => {
          calls.checkedRelations.push('historial');
          return Promise.resolve(0);
        },
      },
      compraSimpleGrupoArchivo: {
        count: () => {
          calls.checkedRelations.push('archivo');
          return Promise.resolve(0);
        },
      },
      notificacion: {
        findMany: () => Promise.resolve(compra.notificaciones),
        deleteMany: () => Promise.resolve({ count: 1 }),
        count: () => {
          calls.checkedRelations.push('notificacion');
          return Promise.resolve(0);
        },
      },
    };
    const prisma = {
      compraSimple: tx.compraSimple,
      notificacion: tx.notificacion,
      $transaction: (callback: (client: typeof tx) => unknown) => {
        calls.transactions += 1;
        return Promise.resolve(callback(tx));
      },
    };
    const storage = {
      remove: (url: string) => {
        calls.removedUrls.push(url);
        return Promise.resolve();
      },
    };
    const service = new ComprasSimplesService(
      prisma as never,
      storage as never,
      {} as never,
      {} as never,
    );

    return { service, calls };
  }

  it('expone todas las entidades afectadas antes de eliminar', async () => {
    const { service } = setup();

    await expect(
      service.getHardDeleteImpact(compra.id, 'admin_ti'),
    ).resolves.toMatchObject({
      totalRegistros: 9,
      pagosPagados: 1,
      entidadesAfectadas: {
        comprasSimples: 1,
        ordenesCompra: 1,
        items: 2,
        pagos: 2,
        historialAprobacion: 1,
        archivos: 1,
        notificaciones: 1,
      },
    });
  });

  it('rechaza el hard delete para cualquier rol distinto de admin_ti', async () => {
    const { service, calls } = setup();

    await expect(
      service.hardDelete(compra.id, compra.codigo, 'administrador'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(calls.transactions).toBe(0);
  });

  it('exige escribir exactamente el código de la compra', async () => {
    const { service, calls } = setup();

    await expect(
      service.hardDelete(compra.id, 'CONFIRMAR', 'admin_ti'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(calls.deletedIds).toHaveLength(0);
  });

  it('elimina, verifica cada relación y limpia los archivos físicos', async () => {
    const { service, calls } = setup();

    await expect(
      service.hardDelete(compra.id, compra.codigo, 'admin_ti'),
    ).resolves.toMatchObject({
      eliminado: true,
      totalRegistros: 9,
      verificacion: {
        registrosRelacionadosRestantes: 0,
        archivosFisicosEliminados: 1,
        archivosFisicosNoEliminados: 0,
      },
    });
    expect(calls.deletedIds).toEqual([compra.id]);
    expect(calls.checkedRelations).toEqual([
      'compraSimple',
      'ordenCompra',
      'ordenCompraItem',
      'pago',
      'historial',
      'archivo',
      'notificacion',
    ]);
    expect(calls.removedUrls).toEqual(['/uploads/compras-simples/a.pdf']);
  });

  it('aborta si la verificación encuentra un registro relacionado', async () => {
    const { service, calls } = setup(1);

    await expect(
      service.hardDelete(compra.id, compra.codigo, 'admin_ti'),
    ).rejects.toThrow(
      'La verificación detectó registros relacionados; la eliminación fue revertida',
    );
    expect(calls.removedUrls).toHaveLength(0);
  });

  it('rechaza un grupo pendiente desde área técnica y conserva su motivo en el historial', async () => {
    const grupo = {
      id: 'grupo-1',
      estadoAprobacion: 'pendiente',
      compraSimple: { tipo: 'civil' },
    };
    const ordenCompra = { update: jest.fn().mockResolvedValue(grupo) };
    const historial = { create: jest.fn().mockResolvedValue({}) };
    const service = new ComprasSimplesService(
      {
        $transaction: (callback: (tx: unknown) => unknown) =>
          Promise.resolve(
            callback({ ordenCompra, compraSimpleGrupoHistorial: historial }),
          ),
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest.spyOn(service as never, 'findGrupo').mockResolvedValue(grupo);

    await service.cancelarGrupo(
      grupo.id,
      { motivo: 'El material ya no es necesario' },
      'tecnico-1',
      'ing_civil',
    );

    expect(ordenCompra.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: grupo.id },
        data: expect.objectContaining({
          estado: 'cancelada',
          estadoAprobacion: 'cancelada',
          notaAprobacion: 'El material ya no es necesario',
        }),
      }),
    );
    expect(historial.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: 'cancelada',
          nota: 'El material ya no es necesario',
          actorId: 'tecnico-1',
          actorRole: 'ing_civil',
        }),
      }),
    );
  });

  it('no permite rechazar un grupo a quien no corresponde el paso', async () => {
    const service = new ComprasSimplesService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest.spyOn(service as never, 'findGrupo').mockResolvedValue({
      estadoAprobacion: 'pendiente',
      compraSimple: { tipo: 'civil' },
    });

    await expect(
      service.cancelarGrupo(
        'grupo-1',
        { motivo: 'No aplica' },
        'usuario-1',
        'logistica',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('ComprasSimplesService.create (tipos permitidos por rol)', () => {
  const dto = (tipo: string) =>
    ({
      nombre: 'Compra de prueba',
      tipo,
      proyectoId: 'proy-1',
      // Sin proveedor: si el rol sí puede crear el tipo, la validación de
      // grupos corta enseguida con BadRequest y no hace falta mockear Prisma.
      grupos: [{ items: [] }],
    }) as never;

  function crearServicio() {
    return new ComprasSimplesService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  it.each([
    ['jefe_sig', 'civil'],
    ['jefe_sig', 'administrativo'],
    ['pdr', 'electrico'],
    ['ing_civil', 'seguridad'],
    ['ing_electrico', 'civil'],
    ['supervisor_electrico', 'administrativo'],
  ])('rechaza que "%s" cree una compra de tipo "%s"', async (rol, tipo) => {
    await expect(
      crearServicio().create(dto(tipo), 'user-1', rol as never),
    ).rejects.toThrow(ForbiddenException);
  });

  it.each([
    ['jefe_sig', 'seguridad'],
    ['pdr', 'seguridad'],
    ['ing_civil', 'electrico'],
    ['supervisor_civil', 'civil'],
    ['ing_electrico', 'seguridad'],
    ['logistica', 'administrativo'],
    ['gerencia', 'civil'],
    ['admin_ti', 'seguridad'],
  ])(
    'deja pasar a "%s" con el tipo "%s" a la siguiente validación',
    async (rol, tipo) => {
      await expect(
        crearServicio().create(dto(tipo), 'user-1', rol as never),
      ).rejects.toThrow(BadRequestException);
    },
  );
});

describe('ComprasSimplesService — coordinador SSOMA (obras asignadas)', () => {
  function setup(asignado: boolean) {
    const prisma = {
      proyectoSupervisor: {
        findUnique: jest
          .fn()
          .mockResolvedValue(asignado ? { userId: 'u-ssoma' } : null),
      },
      compraSimple: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    const events = { emit: jest.fn() };
    const service = new ComprasSimplesService(
      prisma as never,
      {} as never,
      events as never,
      {} as never,
    );
    return { prisma, events, service };
  }
  const grupo = (tipo: string, estadoAprobacion = 'pendiente') => ({
    id: 'g1',
    estadoAprobacion,
    archivos: [],
    compraSimple: {
      id: 'c1',
      codigo: 'CS-1',
      nombre: 'Guantes',
      tipo,
      proyectoId: 'p1',
      esRendicion: false,
    },
  });
  const conGrupo = (service: ComprasSimplesService, g: unknown) =>
    jest.spyOn(service as never, 'findGrupo').mockResolvedValue(g);

  it('aprueba el paso técnico de seguridad en una obra asignada', async () => {
    const { prisma, events, service } = setup(true);
    conGrupo(service, grupo('seguridad'));
    prisma.$transaction.mockImplementation((cb: unknown) =>
      (cb as (tx: unknown) => unknown)({
        ordenCompra: {
          update: jest.fn().mockResolvedValue({
            id: 'g1',
            estadoAprobacion: 'aprobada_tecnico',
          }),
        },
        compraSimpleGrupoHistorial: { create: jest.fn() },
      }),
    );

    await expect(
      service.aprobarGrupo('g1', {}, 'u-ssoma', 'coordinador_ssoma'),
    ).resolves.toEqual(
      expect.objectContaining({ estadoAprobacion: 'aprobada_tecnico' }),
    );
    expect(events.emit).toHaveBeenCalledTimes(1);
  });

  it('no decide en una obra donde no está asignado (aprobar, observar, rechazar, editar)', async () => {
    const { prisma, service } = setup(false);
    conGrupo(service, grupo('seguridad'));

    await expect(
      service.aprobarGrupo('g1', {}, 'u-ssoma', 'coordinador_ssoma'),
    ).rejects.toThrow('No estás asignado a esta obra');
    await expect(
      service.observarGrupo(
        'g1',
        { nota: 'x' },
        'u-ssoma',
        'coordinador_ssoma',
      ),
    ).rejects.toThrow('No estás asignado a esta obra');
    await expect(
      service.cancelarGrupo(
        'g1',
        { motivo: 'x' },
        'u-ssoma',
        'coordinador_ssoma',
      ),
    ).rejects.toThrow('No estás asignado a esta obra');
    await expect(
      service.editarItemsGrupo(
        'g1',
        { items: [] },
        'u-ssoma',
        'coordinador_ssoma',
      ),
    ).rejects.toThrow('No estás asignado a esta obra');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('solo decide compras de seguridad, aunque estén en su obra', async () => {
    const { service } = setup(true);
    conGrupo(service, grupo('civil'));
    await expect(
      service.aprobarGrupo('g1', {}, 'u-ssoma', 'coordinador_ssoma'),
    ).rejects.toThrow('no puede aprobar este paso');
  });

  it('no da el segundo paso (gerencia)', async () => {
    const { service } = setup(true);
    conGrupo(service, grupo('seguridad', 'aprobada_tecnico'));
    await expect(
      service.aprobarGrupo('g1', {}, 'u-ssoma', 'coordinador_ssoma'),
    ).rejects.toThrow('no puede aprobar este paso');
  });

  it('el listado y el detalle se acotan a sus obras', async () => {
    const { prisma, service } = setup(false);
    await service.findAll({}, { id: 'u-ssoma', role: 'coordinador_ssoma' });
    expect(prisma.compraSimple.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          proyectoId: undefined,
          proyecto: { supervisores: { some: { userId: 'u-ssoma' } } },
        },
      }),
    );

    prisma.compraSimple.findUnique.mockResolvedValue({
      id: 'c1',
      proyectoId: 'p2',
    });
    await expect(
      service.findOne('c1', { id: 'u-ssoma', role: 'coordinador_ssoma' }),
    ).rejects.toThrow('No estás asignado a esta obra');
  });

  it('los demás roles ven el listado completo', async () => {
    const { prisma, service } = setup(false);
    await service.findAll({}, { id: 'u-1', role: 'jefe_sig' });
    expect(prisma.compraSimple.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { proyectoId: undefined } }),
    );
  });
});

describe('CreateCompraSimpleDto.nombre', () => {
  const base = {
    tipo: 'civil',
    proyectoId: 'proy-1',
    grupos: [{ items: [{ descripcion: 'Cemento', cantidad: 1, precioUnitario: 1 }] }],
  };
  const errorDeNombre = async (extra: object) => {
    const { plainToInstance } = await import('class-transformer');
    const { validate } = await import('class-validator');
    const { CreateCompraSimpleDto } = await import(
      './dto/create-compra-simple.dto.js'
    );
    const errores = await validate(
      plainToInstance(CreateCompraSimpleDto, { ...base, ...extra }),
    );
    return errores.find((e) => e.property === 'nombre');
  };

  it('ya no es obligatorio: el servicio lo arma con los ítems', async () => {
    expect(await errorDeNombre({})).toBeUndefined();
  });

  it('sigue validando que sea texto cuando se envía', async () => {
    expect(await errorDeNombre({ nombre: 123 })).toBeDefined();
  });
});

describe('ComprasSimplesService.subirArchivo (cotización)', () => {
  function setup(estadoAprobacion: string, esRendicion = false) {
    const create = jest.fn().mockResolvedValue({ id: 'a1' });
    const prisma = { compraSimpleGrupoArchivo: { create } };
    const storage = { save: jest.fn().mockResolvedValue({ url: '/u/x.pdf' }) };
    const service = new ComprasSimplesService(
      prisma as never,
      storage as never,
      {} as never,
      {} as never,
    );
    jest.spyOn(service as never, 'findGrupo').mockResolvedValue({
      id: 'g1',
      creadoPorId: 'u1',
      estadoAprobacion,
      compraSimple: { esRendicion },
    } as never);
    return { service, create };
  }
  const archivo = {
    buffer: Buffer.from('x'),
    originalname: 'cotizacion.pdf',
    mimetype: 'application/pdf',
  } as Express.Multer.File;

  it('acepta la cotización mientras el grupo está pendiente', async () => {
    const { service, create } = setup('pendiente');
    await service.subirArchivo('g1', archivo, 'u1', 'cotizacion');
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: 'cotizacion', grupoId: 'g1' }),
    });
  });

  it('sigue rechazando una factura en un grupo pendiente que no es rendición', async () => {
    const { service } = setup('pendiente');
    await expect(
      service.subirArchivo('g1', archivo, 'u1', 'comprobante'),
    ).rejects.toThrow(BadRequestException);
  });

  it('solo el creador puede adjuntar', async () => {
    const { service } = setup('pendiente');
    await expect(
      service.subirArchivo('g1', archivo, 'otro', 'cotizacion'),
    ).rejects.toThrow(ForbiddenException);
  });
});
