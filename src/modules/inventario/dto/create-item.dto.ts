import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { TipoItem, UnidadMedida } from '../../../prisma/types.js';

export class CreateItemDto {
  @IsString()
  codigo: string;

  @IsString()
  nombre: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsEnum(UnidadMedida)
  unidad?: UnidadMedida;

  @IsOptional()
  @IsString()
  categoria?: string;

  @IsOptional()
  @IsEnum(TipoItem)
  tipo?: TipoItem;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsString()
  notas?: string;
}
