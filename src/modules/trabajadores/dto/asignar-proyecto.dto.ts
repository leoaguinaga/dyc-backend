import { IsDateString, IsOptional, IsString } from 'class-validator';

export class AsignarProyectoDto {
  @IsString()
  proyectoId: string;

  @IsDateString()
  fechaIngreso: string;

  @IsOptional()
  @IsDateString()
  fechaSalida?: string;
}
