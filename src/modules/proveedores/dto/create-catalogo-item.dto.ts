import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { UnidadMedida } from '../../../prisma/types.js';

export class CreateCatalogoItemDto {
  @IsString()
  descripcion: string;

  @IsNumber()
  @Min(0)
  precioRef: number;

  @IsOptional()
  @IsEnum(UnidadMedida)
  unidad?: UnidadMedida;

  @IsOptional()
  @IsString()
  nota?: string;
}

export class UpdateCatalogoItemDto {
  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precioRef?: number;

  @IsOptional()
  @IsEnum(UnidadMedida)
  unidad?: UnidadMedida;

  @IsOptional()
  @IsBoolean()
  vigente?: boolean;

  @IsOptional()
  @IsString()
  nota?: string;
}
