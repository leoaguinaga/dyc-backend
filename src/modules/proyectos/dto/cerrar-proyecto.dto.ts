import { IsDateString, IsNumber, IsString, Min } from 'class-validator';

export class CerrarProyectoDto {
  @IsNumber()
  @Min(0.01)
  monto: number;

  @IsDateString()
  fechaProgramada: string;

  @IsString()
  actaConformidadNombre: string;

  @IsString()
  actaConformidadUrl: string;
}
