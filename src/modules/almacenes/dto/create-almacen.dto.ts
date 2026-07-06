import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TipoAlmacen } from '../../../prisma/types.js';

export class CreateAlmacenDto {
  @IsString()
  nombre: string;

  @IsOptional()
  @IsEnum(TipoAlmacen)
  tipo?: TipoAlmacen;

  @IsOptional()
  @IsString()
  ciudad?: string;

  @IsOptional()
  @IsString()
  notas?: string;
}
