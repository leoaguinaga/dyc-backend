import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { Role } from '../../../prisma/types.js';

export class CrearAccesoDto {
  @IsEmail()
  email: string;

  @IsEnum(Role)
  role: Role;

  @IsString()
  @MinLength(8)
  password: string;
}
