import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { getCampoMeta, getEntidadMeta } from './catalogo/index.js';
import type { CampoReporte, OperadorFiltro, TipoCampo } from './catalogo/tipos.js';
import type {
  FiltroReporteDto,
  MetricaReporteDto,
  QueryReporteDinamicoDto,
} from './dto/query-reporte-dinamico.dto.js';
import {
  acumularMetrica,
  claveDeGrupo,
  crearEstadoMetrica,
  finalizarMetrica,
  type EstadoMetrica,
} from './reportes-aggregation.util.js';

export interface ColumnaReporte {
  key: string;
  label: string;
  tipo: TipoCampo | 'number';
}

export interface ResultadoReporte {
  columnas: ColumnaReporte[];
  filas: Record<string, unknown>[];
}

const TAKE_INTERNO_AGREGADO = 5000;
const TAKE_DETALLE_DEFAULT = 500;
const TAKE_DETALLE_MAX = 5000;

/** Delegate mínimo de Prisma que necesitamos, tipado laxo porque el modelo se resuelve en runtime. */
type PrismaDelegate = { findMany: (args: { where: unknown; select: unknown; take: number }) => Promise<Record<string, unknown>[]> };

function agregarASelect(select: Record<string, any>, path: string[]): void {
  const [head, ...resto] = path;
  if (resto.length === 0) {
    if (select[head] === undefined) select[head] = true;
    return;
  }
  const actual = select[head];
  const nested: Record<string, any> = actual && typeof actual === 'object' && actual.select ? actual.select : {};
  select[head] = { select: nested };
  agregarASelect(nested, resto);
}

function agregarAWhere(where: Record<string, any>, path: string[], condicion: Record<string, unknown>): void {
  const [head, ...resto] = path;
  if (resto.length === 0) {
    where[head] = { ...(where[head] ?? {}), ...condicion };
    return;
  }
  const nested: Record<string, any> = where[head] ?? {};
  where[head] = nested;
  agregarAWhere(nested, resto, condicion);
}

function obtenerValorPath(fila: Record<string, unknown>, path: string[]): unknown {
  let actual: unknown = fila;
  for (const key of path) {
    if (actual === null || actual === undefined) return null;
    actual = (actual as Record<string, unknown>)[key];
  }
  return actual;
}

function aplicarTransformVirtual(campo: CampoReporte, valorCrudo: unknown): unknown {
  if (!campo.virtual) return valorCrudo;
  if (campo.virtual.transform === 'mesTruncado') {
    if (!valorCrudo) return null;
    const fecha = valorCrudo instanceof Date ? valorCrudo : new Date(valorCrudo as string);
    if (Number.isNaN(fecha.getTime())) return null;
    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
  }
  return valorCrudo;
}

function normalizarValorSalida(campo: CampoReporte, valor: unknown): unknown {
  if (campo.tipo === 'decimal' && valor !== null && valor !== undefined) return Number(valor);
  return valor;
}

function condicionOperador(operador: OperadorFiltro, valor: unknown): Record<string, unknown> {
  switch (operador) {
    case 'eq':
      return { equals: valor };
    case 'neq':
      return { not: valor };
    case 'gt':
      return { gt: valor };
    case 'gte':
      return { gte: valor };
    case 'lt':
      return { lt: valor };
    case 'lte':
      return { lte: valor };
    case 'contains':
      return { contains: valor, mode: 'insensitive' };
    case 'in':
      return { in: valor as unknown[] };
    case 'between': {
      const [desde, hasta] = valor as [unknown, unknown];
      return { gte: desde, lte: hasta };
    }
  }
}

function coerceUno(campo: CampoReporte, v: unknown): unknown {
  switch (campo.tipo) {
    case 'date': {
      const fecha = new Date(v as string);
      if (Number.isNaN(fecha.getTime())) {
        throw new BadRequestException(`Valor de fecha inválido para el campo "${campo.key}"`);
      }
      return fecha;
    }
    case 'number':
    case 'decimal': {
      const n = Number(v);
      if (Number.isNaN(n)) throw new BadRequestException(`Valor numérico inválido para el campo "${campo.key}"`);
      return n;
    }
    case 'boolean': {
      if (typeof v === 'boolean') return v;
      if (v === 'true') return true;
      if (v === 'false') return false;
      throw new BadRequestException(`Valor booleano inválido para el campo "${campo.key}"`);
    }
    case 'enum': {
      if (typeof v !== 'string' || !campo.enumValues?.includes(v)) {
        throw new BadRequestException(`Valor "${String(v)}" no es válido para el campo enum "${campo.key}"`);
      }
      return v;
    }
    default:
      return v;
  }
}

function coerceValor(campo: CampoReporte, operador: OperadorFiltro, valorCrudo: unknown): unknown {
  if (operador === 'in') {
    if (!Array.isArray(valorCrudo) || valorCrudo.length === 0) {
      throw new BadRequestException(`El operador "in" requiere un arreglo de valores para "${campo.key}"`);
    }
    return valorCrudo.map((v) => coerceUno(campo, v));
  }
  if (operador === 'between') {
    if (!Array.isArray(valorCrudo) || valorCrudo.length !== 2) {
      throw new BadRequestException(`El operador "between" requiere [desde, hasta] para "${campo.key}"`);
    }
    return valorCrudo.map((v) => coerceUno(campo, v));
  }
  return coerceUno(campo, valorCrudo);
}

@Injectable()
export class ReportesQueryService {
  constructor(private prisma: PrismaService) {}

  async ejecutar(query: QueryReporteDinamicoDto): Promise<ResultadoReporte> {
    const meta = getEntidadMeta(query.entidad);

    const filtros: FiltroReporteDto[] = query.filtros ?? [];
    const agruparPor: string[] = query.agruparPor ?? [];
    const metricas: MetricaReporteDto[] = query.metricas ?? [];
    const esAgregado = agruparPor.length > 0 || metricas.length > 0;

    const where: Record<string, any> = {};
    for (const filtro of filtros) {
      const campo = getCampoMeta(query.entidad, filtro.campo);
      if (!campo.operadores.includes(filtro.operador)) {
        throw new BadRequestException(`El operador "${filtro.operador}" no está permitido para el campo "${filtro.campo}"`);
      }
      const valor = coerceValor(campo, filtro.operador, filtro.valor);
      agregarAWhere(where, campo.path, condicionOperador(filtro.operador, valor));
    }

    const camposAgrupar = agruparPor.map((key) => {
      const campo = getCampoMeta(query.entidad, key);
      if (!campo.agrupable) throw new BadRequestException(`El campo "${key}" no es agrupable`);
      return campo;
    });

    const camposMetrica = metricas.map((m) => {
      const campo = getCampoMeta(query.entidad, m.campo);
      if (m.funcion !== 'count') {
        if (campo.tipo !== 'number' && campo.tipo !== 'decimal') {
          throw new BadRequestException(`La función "${m.funcion}" requiere un campo numérico ("${campo.key}")`);
        }
        if (!campo.metrica) throw new BadRequestException(`El campo "${campo.key}" no admite agregación numérica`);
      }
      return { campo, funcion: m.funcion };
    });

    const select: Record<string, any> = {};
    for (const campo of camposAgrupar) agregarASelect(select, campo.path);
    for (const { campo } of camposMetrica) agregarASelect(select, campo.path);

    if (!esAgregado) {
      const columnasKeys = query.columnas ?? meta.campos.filter((c) => !c.virtual).map((c) => c.key);
      const camposColumna = columnasKeys.map((key) => getCampoMeta(query.entidad, key));
      for (const campo of camposColumna) agregarASelect(select, campo.path);

      const take = Math.min(query.limite ?? TAKE_DETALLE_DEFAULT, TAKE_DETALLE_MAX);
      const delegate = this.delegateDe(meta.modeloPrisma);
      const filas = await delegate.findMany({ where, select, take });

      return {
        columnas: camposColumna.map((c) => ({ key: c.key, label: c.label, tipo: c.tipo })),
        filas: filas.map((fila) => {
          const row: Record<string, unknown> = {};
          for (const campo of camposColumna) {
            row[campo.key] = normalizarValorSalida(campo, aplicarTransformVirtual(campo, obtenerValorPath(fila, campo.path)));
          }
          return row;
        }),
      };
    }

    const delegate = this.delegateDe(meta.modeloPrisma);
    const filas = await delegate.findMany({ where, select, take: TAKE_INTERNO_AGREGADO });

    const grupos = new Map<string, { valoresGrupo: unknown[]; metricas: Map<string, EstadoMetrica> }>();

    for (const fila of filas) {
      const valoresGrupo = camposAgrupar.map((campo) =>
        normalizarValorSalida(campo, aplicarTransformVirtual(campo, obtenerValorPath(fila, campo.path))),
      );
      const clave = claveDeGrupo(valoresGrupo);
      let grupo = grupos.get(clave);
      if (!grupo) {
        grupo = { valoresGrupo, metricas: new Map() };
        for (const { campo, funcion } of camposMetrica) {
          grupo.metricas.set(`${campo.key}:${funcion}`, crearEstadoMetrica(funcion));
        }
        grupos.set(clave, grupo);
      }
      for (const { campo, funcion } of camposMetrica) {
        const estado = grupo.metricas.get(`${campo.key}:${funcion}`)!;
        acumularMetrica(estado, obtenerValorPath(fila, campo.path));
      }
    }

    const columnas: ColumnaReporte[] = [
      ...camposAgrupar.map((c) => ({ key: c.key, label: c.label, tipo: c.tipo })),
      ...camposMetrica.map(({ campo, funcion }) => ({
        key: `${campo.key}_${funcion}`,
        label: `${campo.label} (${funcion})`,
        tipo: 'number' as const,
      })),
    ];

    const salida = Array.from(grupos.values()).map((grupo) => {
      const row: Record<string, unknown> = {};
      camposAgrupar.forEach((campo, i) => {
        row[campo.key] = grupo.valoresGrupo[i];
      });
      camposMetrica.forEach(({ campo, funcion }) => {
        const estado = grupo.metricas.get(`${campo.key}:${funcion}`)!;
        row[`${campo.key}_${funcion}`] = finalizarMetrica(estado);
      });
      return row;
    });

    return { columnas, filas: salida };
  }

  private delegateDe(modeloPrisma: string): PrismaDelegate {
    return (this.prisma as unknown as Record<string, PrismaDelegate>)[modeloPrisma];
  }
}
