import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateContactoProveedorDto {
  @IsString()
  nombre: string;

  @IsOptional()
  @IsString()
  cargo?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
