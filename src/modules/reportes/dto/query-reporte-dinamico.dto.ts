import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import type { FuncionMetrica, OperadorFiltro } from '../catalogo/tipos.js';

const OPERADORES: OperadorFiltro[] = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'in',
  'between',
];

const FUNCIONES_METRICA: FuncionMetrica[] = ['count', 'sum', 'avg', 'min', 'max'];

export class FiltroReporteDto {
  @IsString()
  campo: string;

  @IsIn(OPERADORES)
  operador: OperadorFiltro;

  @IsNotEmpty()
  valor: unknown;
}

export class MetricaReporteDto {
  @IsString()
  campo: string;

  @IsIn(FUNCIONES_METRICA)
  funcion: FuncionMetrica;
}

export class QueryReporteDinamicoDto {
  @IsString()
  entidad: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FiltroReporteDto)
  filtros?: FiltroReporteDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  agruparPor?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MetricaReporteDto)
  metricas?: MetricaReporteDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  columnas?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  limite?: number;
}
