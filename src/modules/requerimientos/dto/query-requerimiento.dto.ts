import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { ALCANCES_LISTADO, type AlcanceListado } from '../../../shared/alcance/alcance-listado.js';
import { EstadoRequerimiento } from '../../../prisma/types.js';

export class QueryRequerimientoDto {
  @IsOptional()
  @IsEnum(EstadoRequerimiento)
  estado?: EstadoRequerimiento;

  @IsOptional()
  @IsString()
  proyectoId?: string;

  @IsOptional()
  @IsIn(ALCANCES_LISTADO)
  alcance?: AlcanceListado;
}
