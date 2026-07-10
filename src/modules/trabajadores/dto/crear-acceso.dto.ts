import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import type { Role } from '../../../prisma/types.js';

export class CrearAccesoDto {
  @IsEmail()
  email: string;

  @IsEnum(['supervisor', 'ing_civil', 'ing_electrico', 'jefe_sig', 'logistica', 'gerencia', 'administrador'])
  role: Role;

  @IsString()
  @MinLength(8)
  password: string;
}
