import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  DestinoPago,
  MetodoPagoTrabajador,
  TipoRequerimiento,
  UnidadMedida,
} from '../../../prisma/types.js';

export class CreateCompraSimpleItemDto {
  @IsString()
  descripcion: string;

  @IsNumber()
  @Min(0.01)
  cantidad: number;

  @IsOptional()
  unidad?: UnidadMedida;

  @IsNumber()
  @Min(0)
  precioUnitario: number;
}

export class CreateCompraSimpleGrupoDto {
  @IsOptional()
  @IsString()
  proveedorId?: string;

  // Requerido cuando no se referencia un Proveedor registrado (ej. bazares/ferreterías sin RUC)
  @ValidateIf((g: CreateCompraSimpleGrupoDto) => !g.proveedorId)
  @IsString()
  proveedorNombreLibre?: string;

  @IsOptional()
  @IsDateString()
  fechaEntrega?: string;

  @IsEnum(DestinoPago)
  destinoPago: DestinoPago;

  // Destino "empresa": se pide siempre, aunque el proveedor ya tenga banco/cuenta
  // registrados — evita depositar a la cuenta equivocada cuando un proveedor
  // maneja varias cuentas.
  @ValidateIf((g: CreateCompraSimpleGrupoDto) => g.destinoPago === 'empresa')
  @IsString()
  pagoBanco?: string;

  @ValidateIf((g: CreateCompraSimpleGrupoDto) => g.destinoPago === 'empresa')
  @IsString()
  pagoNumeroCuenta?: string;

  @ValidateIf((g: CreateCompraSimpleGrupoDto) => g.destinoPago === 'empresa')
  @IsString()
  pagoRazonSocial?: string;

  // Destino "trabajador": siempre es el propio solicitante (resuelto en el backend)
  @ValidateIf((g: CreateCompraSimpleGrupoDto) => g.destinoPago === 'trabajador')
  @IsEnum(MetodoPagoTrabajador)
  pagoMetodo?: MetodoPagoTrabajador;

  @ValidateIf(
    (g: CreateCompraSimpleGrupoDto) =>
      g.destinoPago === 'trabajador' && g.pagoMetodo === 'transferencia',
  )
  @IsString()
  pagoTrabajadorBanco?: string;

  @ValidateIf(
    (g: CreateCompraSimpleGrupoDto) =>
      g.destinoPago === 'trabajador' && g.pagoMetodo === 'transferencia',
  )
  @IsString()
  pagoTrabajadorNumeroCuenta?: string;

  @ValidateIf(
    (g: CreateCompraSimpleGrupoDto) =>
      g.destinoPago === 'trabajador' &&
      (g.pagoMetodo === 'yape' || g.pagoMetodo === 'plin'),
  )
  @IsString()
  pagoTrabajadorNumero?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateCompraSimpleItemDto)
  items: CreateCompraSimpleItemDto[];
}

export class CreateCompraSimpleDto {
  @IsString()
  nombre: string;

  @IsEnum(TipoRequerimiento)
  tipo: TipoRequerimiento;

  @IsOptional()
  @IsBoolean()
  urgente?: boolean;

  @IsString()
  proyectoId: string;

  @IsOptional()
  @IsString()
  nota?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateCompraSimpleGrupoDto)
  grupos: CreateCompraSimpleGrupoDto[];
}
