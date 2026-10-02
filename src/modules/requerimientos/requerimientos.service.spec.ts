import { ForbiddenException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { RequerimientosService } from './requerimientos.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { StorageProvider } from '../../shared/storage/storage.interface.js';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { EstadoRequerimiento, Role } from '../../prisma/types.js';

function crearContexto(requerimientoBase: Partial<{
  id: string;
  estado: EstadoRequerimiento;
  creadoPorId: string;
  proyectoId: string;
  tipo: 'civil' | 'electrico' | 'seguridad' | 'administrativo';
  proyecto: { id: string; nombre: string; codigo: string | null };
}> = {}) {
  const reqData = {
    id: 'req-1',
    codigo: 'REQ-2026-001',
    nombre: 'Req de prueba',
    tipo: 'civil' as const,
    estado: 'borrador' as EstadoRequerimiento,
    creadoPorId: 'user-solicitante',
    proyectoId: 'proy-1',
    proyecto: { id: 'proy-1', nombre: 'Obra 1', codigo: 'OB-01' },
    items: [],
    ...requerimientoBase,
  };

  const tx = {
    proyecto: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'proy-2',
        nombre: 'Obra 2',
        codigo: 'OB-02',
      }),
    },
    solicitudCotizacion: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    ordenCompra: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    pago: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    requerimientoItem: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    requerimientoHistorial: {
      create: jest.fn().mockResolvedValue({ id: 'hist-1' }),
    },
    requerimiento: {
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ ...reqData, ...data, proyectoId: data.proyectoId ?? reqData.proyectoId }),
      ),
    },
  };

  const prisma = {
    requerimiento: {
      findUnique: jest.fn().mockResolvedValue(reqData),
    },
    $transaction: jest.fn().mockImplementation((callback: (innerTx: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };

  const service = new RequerimientosService(
    prisma as unknown as PrismaService,
    {} as StorageProvider,
    { emit: jest.fn() } as unknown as EventEmitter2,
  );

  return { service, prisma, tx, reqData };
}

describe('RequerimientosService.actualizar (Cambio de Obra y Permisos)', () => {
  describe('Regla a: Solicitante puede cambiar la obra siempre y cuando no esté aprobada', () => {
    const estadosPermitidos: EstadoRequerimiento[] = ['borrador', 'enviado', 'observado'];
    const estadosBloqueados: EstadoRequerimiento[] = ['aprobado', 'en_cotizacion'];

    estadosPermitidos.forEach((estado) => {
      it(`permite al solicitante cambiar la obra cuando el requerimiento está en "${estado}"`, async () => {
        const { service } = crearContexto({ estado, creadoPorId: 'user-solicitante' });

        const result = await service.actualizar(
          'req-1',
          { proyectoId: 'proy-2' },
          'user-solicitante',
          'supervisor' as Role,
        );

        expect(result).toBeDefined();
      });
    });

    estadosBloqueados.forEach((estado) => {
      it(`rechaza al solicitante cambiar la obra cuando el requerimiento está en "${estado}"`, async () => {
        const { service } = crearContexto({ estado, creadoPorId: 'user-solicitante' });

        await expect(
          service.actualizar(
            'req-1',
            { proyectoId: 'proy-2' },
            'user-solicitante',
            'supervisor' as Role,
          ),
        ).rejects.toThrow(ForbiddenException);
      });
    });
  });

  describe('Regla b: Área técnica, logística, administración, gestión y admin_ti pueden cambiar obra si no está en cotización', () => {
    const rolesGrupoB: Role[] = [
      'ing_civil',
      'ing_electrico',
      'jefe_sig',
      'logistica',
      'administrador',
      'gerencia',
      'admin_ti',
    ];

    rolesGrupoB.forEach((rol) => {
      it(`permite al rol "${rol}" cambiar la obra cuando el requerimiento está "aprobado"`, async () => {
        const { service } = crearContexto({ estado: 'aprobado', creadoPorId: 'otro-usuario' });

        const result = await service.actualizar(
          'req-1',
          { proyectoId: 'proy-2' },
          'user-grupo-b',
          rol,
        );

        expect(result).toBeDefined();
      });

      it(`rechaza al rol "${rol}" cambiar la obra cuando el requerimiento está "en_cotizacion"`, async () => {
        const { service } = crearContexto({ estado: 'en_cotizacion', creadoPorId: 'otro-usuario' });

        await expect(
          service.actualizar(
            'req-1',
            { proyectoId: 'proy-2' },
            'user-grupo-b',
            rol,
          ),
        ).rejects.toThrow(ForbiddenException);
      });
    });
  });

  describe('Registro en Historial al cambiar obra', () => {
    it('guarda una entrada en el historial con el cambio de obra', async () => {
      const { service, tx } = crearContexto({ estado: 'enviado', creadoPorId: 'user-solicitante' });

      await service.actualizar(
        'req-1',
        { proyectoId: 'proy-2' },
        'user-solicitante',
        'supervisor' as Role,
      );

      expect(tx.requerimientoHistorial.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            requerimientoId: 'req-1',
            nota: expect.stringContaining('Obra cambiada de "Obra 1" a "Obra 2"'),
          }),
        }),
      );
    });
  });
});

describe('RequerimientosService.create (tipos permitidos por rol)', () => {
  function crearServicio() {
    const prisma = {
      requerimiento: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'req-nuevo' }),
      },
    };
    const service = new RequerimientosService(
      prisma as unknown as PrismaService,
      {} as StorageProvider,
      { emit: jest.fn() } as unknown as EventEmitter2,
    );
    return { service, prisma };
  }

  const dtoBase = {
    nombre: 'Req de prueba',
    proyectoId: 'proy-1',
    items: [{ descripcion: 'Casco', cantidad: 1 }],
  };

  const casos: Array<[Role, 'civil' | 'electrico' | 'seguridad' | 'administrativo', boolean]> = [
    ['jefe_sig', 'seguridad', true],
    ['jefe_sig', 'civil', false],
    ['jefe_sig', 'administrativo', false],
    ['pdr', 'seguridad', true],
    ['pdr', 'electrico', false],
    ['ing_electrico', 'electrico', true],
    ['ing_electrico', 'seguridad', true],
    ['ing_electrico', 'civil', false],
    ['supervisor_electrico', 'seguridad', true],
    ['supervisor_electrico', 'administrativo', false],
    ['ing_civil', 'civil', true],
    ['ing_civil', 'electrico', true],
    ['ing_civil', 'seguridad', false],
    ['supervisor_civil', 'electrico', true],
    ['supervisor_civil', 'seguridad', false],
    ['logistica', 'administrativo', true],
    ['gerencia', 'seguridad', true],
    ['administrador', 'civil', true],
    ['admin_ti', 'electrico', true],
  ];

  it.each(casos)('rol "%s" · tipo "%s" · permitido: %s', async (rol, tipo, permitido) => {
    const { service, prisma } = crearServicio();
    const promesa = service.create({ ...dtoBase, tipo } as never, 'user-1', rol);

    if (permitido) {
      await expect(promesa).resolves.toBeDefined();
      expect(prisma.requerimiento.create).toHaveBeenCalledTimes(1);
    } else {
      await expect(promesa).rejects.toThrow(ForbiddenException);
      expect(prisma.requerimiento.create).not.toHaveBeenCalled();
    }
  });
});
