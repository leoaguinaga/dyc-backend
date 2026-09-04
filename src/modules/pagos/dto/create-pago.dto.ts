import { PartialType } from '@nestjs/mapped-types';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreatePagoDto {
  @IsString()
  ordenCompraId: string;

  @IsNumber()
  @Min(0.01)
  @Max(100)
  porcentaje: number;

  @IsDateString()
  fechaProgramada: string;

  @IsOptional()
  @IsString()
  metodoPago?: string;

  @IsOptional()
  @IsString()
  nota?: string;
}

/** Alta rápida para obligaciones que no nacen de una orden de compra. */
export class CreateRecordatorioPagoDto {
  @IsString()
  concepto: string;

  @IsNumber()
  @Min(0.01)
  monto: number;

  @IsDateString()
  fechaProgramada: string;

  @IsIn(['obra', 'administracion'])
  centroCosto: 'obra' | 'administracion';

  @IsOptional()
  @IsString()
  proyectoId?: string;

  @IsOptional()
  @IsString()
  categoria?: string;

  @IsOptional()
  @IsIn(['proveedor', 'trabajador', 'otro'])
  tipoBeneficiario?: 'proveedor' | 'trabajador' | 'otro';

  @IsOptional()
  @IsString()
  beneficiarioNombre?: string;

  @IsOptional()
  @IsString()
  banco?: string;

  @IsOptional()
  @IsString()
  numeroCuenta?: string;

  @IsOptional()
  @IsString()
  cci?: string;

  @IsOptional()
  @IsString()
  metodoPago?: string;

  @IsOptional()
  @IsString()
  nota?: string;
}

export class CreatePagoRecurrenteDto {
  @IsString()
  @IsNotEmpty()
  concepto: string;
  @IsInt()
  @Min(1)
  @Max(31)
  diaVencimiento: number;
  @IsOptional() @IsNumber() @Min(0.01) montoReferencial?: number;
  @IsOptional() @IsString() categoria?: string;
  @IsIn(['obra', 'administracion']) centroCosto: 'obra' | 'administracion';
  @IsOptional() @IsString() proyectoId?: string;
  @IsOptional() @IsString() beneficiarioNombre?: string;
  @IsOptional() @IsString() banco?: string;
  @IsOptional() @IsString() numeroCuenta?: string;
  @IsOptional() @IsString() cci?: string;
}

export class UpdatePagoRecurrenteDto extends PartialType(CreatePagoRecurrenteDto) {
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class CreatePlanillaStaffDto {
  @IsString()
  periodo: string;
}

export class UpdatePagoDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(100)
  porcentaje?: number;

  @IsOptional()
  @IsDateString()
  fechaProgramada?: string;

  @IsOptional()
  @IsString()
  metodoPago?: string;

  @IsOptional()
  @IsString()
  nota?: string;

  @IsOptional()
  @IsString()
  concepto?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  monto?: number;

  @IsOptional()
  @IsString()
  categoria?: string;

  @IsOptional()
  @IsString()
  beneficiarioNombre?: string;

  @IsOptional()
  @IsString()
  banco?: string;

  @IsOptional()
  @IsString()
  numeroCuenta?: string;

  @IsOptional()
  @IsString()
  cci?: string;
}

export class MarcarPagadoDto {
  @IsOptional()
  @IsDateString()
  fechaPagoReal?: string;

  @IsOptional()
  @IsString()
  metodoPago?: string;

  @IsOptional()
  @IsString()
  numeroOperacion?: string;

  @IsOptional()
  @IsString()
  comprobanteNombre?: string;

  @IsOptional()
  @IsString()
  comprobanteUrl?: string;
}

export class SubirComprobantePagoDto {
  @IsOptional()
  @IsString()
  comprobanteNombre?: string;

  @IsOptional()
  @IsString()
  comprobanteUrl?: string;
}

export class QueryPagosDto {
  @IsOptional()
  @IsIn(['borrador', 'pendiente', 'pagado', 'cancelado', 'vencido'])
  estado?: 'borrador' | 'pendiente' | 'pagado' | 'cancelado' | 'vencido';

  @IsOptional()
  @IsString()
  proyectoId?: string;

  @IsOptional()
  @IsString()
  proveedorId?: string;

  @IsOptional()
  @IsIn(['obra', 'administracion'])
  centroCosto?: 'obra' | 'administracion';

  @IsOptional()
  @IsString()
  origen?: string;
}

export class ReportePagosDto {
  @IsDateString()
  fecha: string;

  @IsIn(['pendientes', 'pagados'])
  tipo: 'pendientes' | 'pagados';

  @IsOptional()
  @IsString()
  proyectoId?: string;
}
