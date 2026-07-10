import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

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
}
