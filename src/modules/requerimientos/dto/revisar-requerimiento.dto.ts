import { IsNotEmpty, IsString } from 'class-validator';

export class ObservarRequerimientoDto {
  @IsString()
  @IsNotEmpty({ message: 'Debes indicar qué debe corregir el solicitante' })
  notaRevision: string;
}
