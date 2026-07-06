import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TipoRequerimiento, UnidadMedida } from '../../../prisma/types.js';

export class CreateRequerimientoItemDto {
  @IsString()
  descripcion: string;

  @IsNumber()
  @Min(0.01)
  cantidad: number;

  @IsOptional()
  @IsEnum(UnidadMedida)
  unidad?: UnidadMedida;

  @IsOptional()
  @IsString()
  nota?: string;
}

export class CreateRequerimientoDto {
  @IsString()
  nombre: string;

  @IsString()
  proyectoId: string;

  @IsEnum(TipoRequerimiento)
  tipo: TipoRequerimiento;

  @IsOptional()
  @IsBoolean()
  urgente?: boolean;

  @IsOptional()
  @IsString()
  nota?: string;

  @IsOptional()
  @IsDateString()
  fechaEntregaRequerida?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRequerimientoItemDto)
  items: CreateRequerimientoItemDto[];
}
