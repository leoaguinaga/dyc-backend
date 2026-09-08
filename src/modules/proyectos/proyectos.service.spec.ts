import { BadRequestException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { ProyectosService } from './proyectos.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { StorageProvider } from '../../shared/storage/storage.interface.js';
import type { CreateProyectoDto } from './dto/create-proyecto.dto.js';

function crearContexto() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    proyecto: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
    },
  };
  const prisma = {
    $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
  };
  const service = new ProyectosService(
    prisma as unknown as PrismaService,
    { emit: jest.fn() } as never,
    {} as StorageProvider,
  );

  return { service, tx };
}

function yearRegistro() {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    year: '2-digit',
  }).format(new Date());
}

describe('ProyectosService.create', () => {
  it('genera un código por año para proyectos principales (ej. 26-005)', async () => {
    const { service, tx } = crearContexto();
    const year = yearRegistro();
    tx.proyecto.findMany.mockResolvedValue([
      { codigo: `${year}-004` },
      { codigo: `${year}-001` },
      { codigo: 'codigo-historico' },
    ]);

    const result = await service.create({
      nombre: 'Mantenimiento de planta',
    } as CreateProyectoDto);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.proyecto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          codigo: `${year}-005`,
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({ codigo: `${year}-005` }),
    );
  });

  it('permite especificar el año para registrar proyectos históricos o futuros (ej. 25-003)', async () => {
    const { service, tx } = crearContexto();
    tx.proyecto.findMany.mockResolvedValue([
      { codigo: '25-001' },
      { codigo: '25-002' },
    ]);

    const result = await service.create({
      nombre: 'Proyecto año 2025',
      anio: 2025,
    } as CreateProyectoDto);

    expect(tx.proyecto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          codigo: '25-003',
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({ codigo: '25-003' }),
    );
  });

  it('continúa el correlativo de códigos históricos del mismo año', async () => {
    const { service, tx } = crearContexto();
    tx.proyecto.findMany.mockResolvedValue([
      { codigo: '017-ING-26' },
      { codigo: '018-MAN-26' },
      { codigo: '019-ING-26' },
    ]);

    const result = await service.create({
      nombre: 'Proyecto que continúa el historial',
      anio: 2026,
    } as CreateProyectoDto);

    expect(tx.proyecto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ codigo: '26-020' }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ codigo: '26-020' }));
  });

  it('permite elegir un correlativo anual disponible', async () => {
    const { service, tx } = crearContexto();
    tx.proyecto.findMany.mockResolvedValue([{ codigo: '019-ING-26' }]);

    const result = await service.create({
      nombre: 'Proyecto con correlativo elegido',
      anio: 2026,
      correlativo: 25,
    } as CreateProyectoDto);

    expect(result).toEqual(expect.objectContaining({ codigo: '26-025' }));
  });

  it('rechaza un correlativo elegido que ya está ocupado', async () => {
    const { service, tx } = crearContexto();
    tx.proyecto.findMany.mockResolvedValue([{ codigo: '019-ING-26' }]);

    await expect(
      service.create({
        nombre: 'Proyecto duplicado',
        anio: 2026,
        correlativo: 19,
      } as CreateProyectoDto),
    ).rejects.toThrow('El correlativo 19 ya está ocupado para el año 26');

    expect(tx.proyecto.create).not.toHaveBeenCalled();
  });

  it('crea subproyectos con sufijo decimal desde un padre nuevo', async () => {
    const { service, tx } = crearContexto();
    tx.proyecto.findUnique.mockResolvedValue({
      id: 'proyecto-padre-26',
      codigo: '26-005',
      parentId: null,
    });
    tx.proyecto.findMany.mockResolvedValue([{ codigo: '26-005.01' }]);

    const result = await service.create({
      nombre: 'Subproyecto etapa 2',
      parentId: 'proyecto-padre-26',
    } as CreateProyectoDto);

    expect(result).toEqual(expect.objectContaining({ codigo: '26-005.02' }));
  });

  it('hereda el código padre y asigna el siguiente subproyecto (ej. 26-05-02)', async () => {
    const { service, tx } = crearContexto();
    tx.proyecto.findUnique.mockResolvedValue({
      id: 'proyecto-padre-26',
      codigo: '26-05-01',
      parentId: null,
    });
    tx.proyecto.findMany.mockResolvedValue([]);

    await service.create({
      nombre: 'Subproyecto etapa 1',
      parentId: 'proyecto-padre-26',
    } as CreateProyectoDto);

    expect(tx.proyecto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          codigo: '26-05-02',
          parent: { connect: { id: 'proyecto-padre-26' } },
        }),
      }),
    );
  });

  it('incrementa correlativo de subproyectos existentes (ej. 25-03-11 cuando ya existe 25-03-10)', async () => {
    const { service, tx } = crearContexto();
    tx.proyecto.findUnique.mockResolvedValue({
      id: 'proyecto-padre-25',
      codigo: '25-03-01',
      parentId: null,
    });
    tx.proyecto.findMany.mockResolvedValue([
      { codigo: '25-03-02' },
      { codigo: '25-03-10' },
    ]);

    await service.create({
      nombre: 'Subproyecto etapa 11',
      parentId: 'proyecto-padre-25',
    } as CreateProyectoDto);

    expect(tx.proyecto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          codigo: '25-03-11',
          parent: { connect: { id: 'proyecto-padre-25' } },
        }),
      }),
    );
  });

  it('rechaza que un subproyecto sea padre de otro subproyecto', async () => {
    const { service, tx } = crearContexto();
    tx.proyecto.findUnique.mockResolvedValue({
      id: 'subproyecto-hijo',
      codigo: '26-05-02',
      parentId: 'proyecto-padre',
    });

    await expect(
      service.create({
        nombre: 'Nieto incompatible',
        parentId: 'subproyecto-hijo',
      } as CreateProyectoDto),
    ).rejects.toThrow('Un subproyecto no puede utilizar otro subproyecto como padre');
  });

  it('rechaza padres sin código asignado', async () => {
    const { service, tx } = crearContexto();
    tx.proyecto.findUnique.mockResolvedValue({
      codigo: null,
      parentId: null,
    });

    await expect(
      service.create({
        nombre: 'Hijo incompatible',
        parentId: 'proyecto-sin-codigo',
      } as CreateProyectoDto),
    ).rejects.toThrow('código estandarizado compatible');
  });
});
