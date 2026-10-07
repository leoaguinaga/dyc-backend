import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ReportesGuardadosService } from './reportes-guardados.service.js';
import { CreateReporteGuardadoDto } from './dto/reporte-guardado.dto.js';
import { prismaMock, type PrismaMock } from '../../testing/mocks.js';

const GERENCIA = {
  id: 'u1',
  role: 'gerencia',
  name: 'Ger',
  email: 'g@x',
} as const;
const OTRO = {
  id: 'u2',
  role: 'administrador',
  name: 'Adm',
  email: 'a@x',
} as const;
const TI = { id: 'ti', role: 'admin_ti', name: 'TI', email: 't@x' } as const;
const QUERY = {
  entidad: 'pago',
  agruparPor: ['estado'],
  metricas: [{ campo: 'monto', funcion: 'sum' as const }],
};

function setup() {
  const prisma: PrismaMock = prismaMock();
  return { prisma, service: new ReportesGuardadosService(prisma as never) };
}

describe('ReportesGuardadosService', () => {
  it('lista los propios y los compartidos', async () => {
    const { service, prisma } = setup();
    await service.listar(GERENCIA);
    expect(prisma.reporteGuardado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ creadoPorId: 'u1' }, { compartido: true }] },
      }),
    );
  });

  it('guarda la consulta validando entidad y campos', async () => {
    const { service, prisma } = setup();
    await service.crear(
      { nombre: '  Pagos por estado ', descripcion: ' ', query: QUERY },
      GERENCIA,
    );
    expect(prisma.reporteGuardado.create.mock.calls[0][0].data).toEqual({
      nombre: 'Pagos por estado',
      descripcion: null,
      query: QUERY,
      compartido: false,
      creadoPorId: 'u1',
    });
    await expect(
      service.crear({ nombre: 'x', query: { entidad: 'foo' } }, GERENCIA),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.crear(
        {
          nombre: 'x',
          query: {
            entidad: 'pago',
            filtros: [{ campo: 'inexistente', operador: 'eq', valor: 1 }],
            columnas: ['estado'],
          },
        },
        GERENCIA,
      ),
    ).rejects.toThrow(/inexistente/);
  });

  it('solo quien lo creó (o TI) lo modifica; un ajeno privado no existe', async () => {
    const { service, prisma } = setup();
    await expect(
      service.actualizar('r1', { nombre: 'x' }, GERENCIA),
    ).rejects.toBeInstanceOf(NotFoundException);
    prisma.reporteGuardado.findUnique.mockResolvedValue({
      id: 'r1',
      creadoPorId: 'u2',
      compartido: false,
    });
    await expect(service.eliminar('r1', GERENCIA)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    prisma.reporteGuardado.findUnique.mockResolvedValue({
      id: 'r1',
      creadoPorId: 'u2',
      compartido: true,
    });
    await expect(service.eliminar('r1', GERENCIA)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(await service.eliminar('r1', TI)).toEqual({ success: true });
    await service.actualizar(
      'r1',
      { descripcion: 'Mensual', compartido: false, query: QUERY },
      OTRO,
    );
    expect(prisma.reporteGuardado.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          descripcion: 'Mensual',
          compartido: false,
          query: QUERY,
        }),
      }),
    );
    await service.actualizar('r1', { nombre: 'Solo nombre' }, OTRO);
    expect(prisma.reporteGuardado.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          descripcion: undefined,
          query: undefined,
        }),
      }),
    );
  });

  it('el DTO exige nombre y una consulta válida', async () => {
    const errores = async (body: object) =>
      validate(plainToInstance(CreateReporteGuardadoDto, body));
    expect(await errores({ nombre: 'Ok', query: QUERY })).toHaveLength(0);
    expect(await errores({ nombre: '', query: QUERY })).not.toHaveLength(0);
    expect(
      await errores({ nombre: 'x', query: { entidad: 'pago', limite: 0 } }),
    ).not.toHaveLength(0);
  });
});
