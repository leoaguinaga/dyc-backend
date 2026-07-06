import { IsEnum, IsOptional, IsString } from 'class-validator';
import { EstadoRequerimiento } from '../../../prisma/types.js';

export class QueryRequerimientoDto {
  @IsOptional()
  @IsEnum(EstadoRequerimiento)
  estado?: EstadoRequerimiento;

  @IsOptional()
  @IsString()
  proyectoId?: string;
}
