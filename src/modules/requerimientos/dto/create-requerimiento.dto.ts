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
import { PrioridadRequerimiento, TipoRequerimiento, UnidadMedida } from '../../../prisma/types.js';

export class CreateRequerimientoItemArchivoDto {
  @IsString()
  nombre: string;

  @IsString()
  url: string;
}

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRequerimientoItemArchivoDto)
  archivos?: CreateRequerimientoItemArchivoDto[];
}

export class CreateRequerimientoDto {
  /** Opcional: si no llega, se arma con el primer ítem (ver `nombreAutomatico`). */
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsString()
  proyectoId: string;

  @IsEnum(TipoRequerimiento)
  tipo: TipoRequerimiento;

  @IsOptional()
  @IsEnum(PrioridadRequerimiento)
  prioridad?: PrioridadRequerimiento;

  /** @deprecated Usar `prioridad`; se traduce a `urgente` mientras existan clientes viejos. */
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
