import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { UnidadMedida } from '../../../prisma/types.js';

export class CreateOrdenItemDto {
  @IsOptional()
  @IsString()
  codigo?: string;

  @IsString()
  descripcion: string;

  @IsNumber()
  @Min(0.01)
  cantidad: number;

  @IsOptional()
  @IsEnum(UnidadMedida)
  unidad?: UnidadMedida;

  @IsNumber()
  @Min(0)
  precioUnitario: number;
}

export class UpdateOrdenItemDto {
  @IsOptional()
  @IsString()
  codigo?: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  cantidad?: number;

  @IsOptional()
  @IsEnum(UnidadMedida)
  unidad?: UnidadMedida;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precioUnitario?: number;
}
