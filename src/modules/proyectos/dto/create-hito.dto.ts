import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { CumplimientoHito } from '../../../prisma/types.js';

export class CreateHitoDto {
  @IsString()
  nombre: string;

  @IsDateString()
  fechaProgramada: string;

  @IsOptional()
  @IsString()
  evidencia?: string;

  @IsOptional()
  @IsEnum(CumplimientoHito)
  cumplimiento?: CumplimientoHito;

  @IsString()
  responsableId: string;

  @IsOptional()
  @IsString()
  notas?: string;
}
