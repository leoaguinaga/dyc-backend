import { IsDateString, IsIn, IsOptional } from 'class-validator';

export class MarcarCobradoDto {
  @IsOptional()
  @IsDateString()
  fechaCobrada?: string;
}

export class QueryCobrosDto {
  @IsOptional()
  @IsIn(['pendiente', 'cobrado', 'cancelado', 'vencido'])
  estado?: 'pendiente' | 'cobrado' | 'cancelado' | 'vencido';
}
