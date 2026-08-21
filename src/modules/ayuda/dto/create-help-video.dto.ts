import { ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import type { Role } from '../../../prisma/types.js';

const ROLES: Role[] = [
  'supervisor',
  'supervisor_civil',
  'supervisor_electrico',
  'pdr',
  'ing_civil',
  'ing_electrico',
  'jefe_sig',
  'logistica',
  'gerencia',
  'administrador',
  'admin_ti',
];

export class CreateHelpVideoDto {
  @IsString()
  titulo: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsString()
  youtubeId: string;

  @IsString()
  modulo: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(ROLES, { each: true })
  roles: Role[];

  @IsOptional()
  @IsInt()
  orden?: number;
}
