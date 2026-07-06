import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import type { Role } from '../../../prisma/types.js';

export class CreateTrabajadorDto {
  @IsString()
  nombre: string;

  @IsString()
  dni: string;

  @IsOptional()
  @IsString()
  cargo?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  // Creación de cuenta de acceso al sistema (opcional)
  @IsOptional()
  @IsBoolean()
  crearUsuario?: boolean;

  @IsOptional()
  @IsEnum(['supervisor', 'logistica', 'gerencia', 'administrador'])
  role?: Role;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
