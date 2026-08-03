import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TipoVisita } from '../../../prisma/types.js';

export class CreateRegistroVisitaDto {
  @IsEnum(TipoVisita)
  tipo: TipoVisita;

  @IsOptional()
  @IsString()
  trabajadorId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  nombreLibre?: string;

  @IsOptional()
  @IsString()
  motivo?: string;
}
