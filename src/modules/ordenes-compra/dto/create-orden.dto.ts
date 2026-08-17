import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import type { TipoOrdenCompra } from '../../../../prisma/generated/prisma/enums.js';

export class CreateOrdenCompraDto {
  @IsString()
  solicitudId: string;

  @IsOptional()
  @IsDateString()
  fechaEntrega?: string;

  @IsOptional()
  @IsString()
  nota?: string;

  @IsOptional()
  @IsString()
  lugarEntrega?: string;

  @IsOptional()
  @IsIn(['compra', 'servicio'])
  tipo?: TipoOrdenCompra;
}

export class UpdateOrdenCompraDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  lugarEntrega?: string;

  @IsOptional()
  @IsString()
  nota?: string;

  @IsOptional()
  @IsNumber()
  adelantoPorcentaje?: number;

  @IsOptional()
  @IsNumber()
  saldoPorcentaje?: number;

  @IsOptional()
  @IsNumber()
  detraccionPorcentaje?: number;

  @IsOptional()
  @IsNumber()
  retencionPorcentaje?: number;

  @IsOptional()
  @IsBoolean()
  incluyeIgv?: boolean;

  @IsOptional()
  @IsNumber()
  tipoCambio?: number;

  @IsOptional()
  @IsString()
  contactoProveedorNombre?: string;

  @IsOptional()
  @IsString()
  contactoProveedorTelefono?: string;

  @IsOptional()
  @IsString()
  condicionPago?: string;

  @IsOptional()
  @IsString()
  referencia?: string;

  @IsOptional()
  @IsString()
  concepto?: string;

  @IsOptional()
  @IsString()
  tiempoEntrega?: string;

  @IsOptional()
  @IsString()
  contactoDycNombre?: string;

  @IsOptional()
  @IsString()
  contactoDycArea?: string;

  @IsOptional()
  @IsString()
  contactoDycCelular?: string;

  @IsOptional()
  @IsString()
  contactoDycTelefono?: string;

  @IsOptional()
  @IsIn(['compra', 'servicio'])
  tipo?: TipoOrdenCompra;

  @IsOptional()
  @IsString()
  @Matches(/^(OC|OS)-\d{4}-\d{4,}$/, {
    message: 'El número debe tener el formato OC-2026-0001 u OS-2026-0001',
  })
  numero?: string;
}

export class RecibirOrdenCompraDto {
  @IsOptional()
  @IsDateString()
  fechaEntregaReal?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  calificacionCalidad?: number;
}
