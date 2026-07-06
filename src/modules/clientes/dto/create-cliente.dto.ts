import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateClienteDto {
  @IsString()
  razonSocial: string;

  @IsOptional()
  @IsString()
  nombreComercial?: string;

  @IsOptional()
  @IsString()
  ruc?: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
