import {
  IsDateString,
  IsIn,
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
}

export class QueryPagosDto {
  @IsOptional()
  @IsIn(['pendiente', 'pagado', 'cancelado', 'vencido'])
  estado?: 'pendiente' | 'pagado' | 'cancelado' | 'vencido';

  @IsOptional()
  @IsString()
  proyectoId?: string;

  @IsOptional()
  @IsString()
  proveedorId?: string;
}
