import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UnidadMedida } from '../../../prisma/types.js';

export class AdjudicacionItemDto {
  @IsString()
  solicitudItemId: string;

  @IsString()
  cotizacionItemId: string;
}

export class AdjudicarSolicitudDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdjudicacionItemDto)
  adjudicaciones: AdjudicacionItemDto[];
}

export class CreateCotizacionItemDto {
  @IsString()
  descripcionProveedor: string;

  @IsOptional()
  @IsString()
  itemInventarioId?: string;

  @IsOptional()
  @IsString()
  solicitudItemId?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  precioUnit: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  cantidad: number;

  @IsEnum(UnidadMedida)
  unidad: UnidadMedida;
}

export class CreateCotizacionDto {
  @IsString()
  proveedorId: string;

  @IsOptional()
  @IsString()
  nota?: string;
}

export class CondicionPagoDto {
  @IsNumber()
  @Min(0.01)
  @Max(100)
  porcentaje: number;

  @IsDateString()
  fecha: string;
}

export class ReceiveCotizacionDto {
  @IsOptional()
  @IsString()
  fechaEntrega?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  validezDias?: number;

  @IsOptional()
  @IsString()
  condicionesServicio?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CondicionPagoDto)
  condicionesPago: CondicionPagoDto[];

  @IsOptional()
  @IsString()
  condicionPago?: string;

  @IsOptional()
  @IsBoolean()
  incluyeIgv?: boolean;

  @IsOptional()
  @IsString()
  nota?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCotizacionItemDto)
  items: CreateCotizacionItemDto[];
}
