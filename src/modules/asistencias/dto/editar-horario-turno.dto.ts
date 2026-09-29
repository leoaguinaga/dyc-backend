import { IsDateString } from 'class-validator';

export class EditarHorarioTurnoDto {
  @IsDateString()
  fecha: string;

  @IsDateString()
  horaAperturaReal: string;

  @IsDateString()
  horaCierreReal: string;
}
