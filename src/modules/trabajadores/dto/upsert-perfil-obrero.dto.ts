import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import type { CategoriaObrero } from '../../../prisma/types.js';

export class UpsertPerfilObreroDto {
  @IsOptional()
  @IsEnum(['operario', 'oficial', 'peon'])
  categoria?: CategoriaObrero;

  @IsOptional()
  @IsNumber()
  precioHora?: number;

  @IsOptional()
  @IsString()
  tipoSangre?: string;

  @IsOptional()
  @IsString()
  contactoEmergenciaNombre?: string;

  @IsOptional()
  @IsString()
  contactoEmergenciaTelefono?: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsString()
  tallaUniforme?: string;

  @IsOptional()
  @IsString()
  tallaCalzado?: string;

  @IsOptional()
  @IsString()
  numeroSctr?: string;
}
