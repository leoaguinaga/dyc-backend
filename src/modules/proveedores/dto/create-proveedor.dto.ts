import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateProveedorDto {
  @IsString()
  razonSocial: string;

  @IsOptional()
  @IsString()
  ruc?: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsString()
  rubro?: string;

  @IsOptional()
  @IsString()
  categoria?: string;

  @IsOptional()
  @IsString()
  banco?: string;

  @IsOptional()
  @IsString()
  numeroCuenta?: string;

  @IsOptional()
  @IsString()
  moneda?: string;

  @IsOptional()
  @IsString()
  condicionPago?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
