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
    jest.spyOn(service as never, 'findGrupo').mockResolvedValue(grupo as never);

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
    } as never);

    await expect(
      service.cancelarGrupo('grupo-1', { motivo: 'No aplica' }, 'usuario-1', 'logistica'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
