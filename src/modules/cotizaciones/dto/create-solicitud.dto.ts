import {
  IsArray,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSolicitudItemDto {
  @IsString()
  descripcion: string;

  @IsOptional()
  @IsString()
  unidad?: string;

  @IsOptional()
  @IsString()
  itemInventarioId?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  cantidadTotal: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cantidadAlmacen?: number;
}

export class CreateSolicitudDto {
  @IsOptional()
  @IsString()
  proyectoId?: string;

  @IsOptional()
  @IsString()
  requerimientoId?: string;

  @IsOptional()
  @IsString()
  nota?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSolicitudItemDto)
  items: CreateSolicitudItemDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  proveedorIds?: string[];
}
