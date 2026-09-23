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

  @IsOptional()
  @IsString()
  registradoPorId?: string;
}

const TIPOS_DOCUMENTO_COMPROBANTE = [
  'factura',
  'boleta',
  'guia_remision',
  'recibo',
  'nota_credito',
  'nota_debito',
  'voucher_deposito',
  'cotizacion_propia',
  'cotizacion_proveedor',
  'otro',
] as const;

export class CrearComprobanteDto {
  @IsString()
  @IsNotEmpty()
  numero: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  subNumero?: number;

  @IsIn(TIPOS_DOCUMENTO_COMPROBANTE)
  tipoDocumento: (typeof TIPOS_DOCUMENTO_COMPROBANTE)[number];

  @IsOptional()
  @IsString()
  tipoOperacion?: string;

  @IsOptional()
  @IsString()
  banco?: string;

  @IsOptional()
  @IsString()
  cuenta?: string;

  @IsOptional()
  @IsString()
  detalleGasto?: string;

  @IsOptional()
  @IsString()
  proveedor?: string;

  @IsOptional()
  @IsString()
  cuentaProveedor?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  importe?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  importeRendido?: number;
}

export class ActualizarComprobanteDto {
  @IsOptional()
  @IsIn(['abierto', 'cerrado'])
  estado?: 'abierto' | 'cerrado';

  @IsOptional()
  @IsIn(TIPOS_DOCUMENTO_COMPROBANTE)
  tipoDocumento?: (typeof TIPOS_DOCUMENTO_COMPROBANTE)[number];

  @IsOptional()
  @IsString()
  numero?: string;

  @IsOptional()
  @IsString()
  detalleGasto?: string;

  @IsOptional()
  @IsString()
  proveedor?: string;

  @IsOptional()
  @IsString()
  cuentaProveedor?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  importeRendido?: number;
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
