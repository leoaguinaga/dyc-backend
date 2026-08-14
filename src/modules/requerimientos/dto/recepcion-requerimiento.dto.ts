import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RecepcionRequerimientoDto {
  @IsString()
  @IsNotEmpty({ message: 'Debes adjuntar una foto de la recepción' })
  fotoUrl: string;

  @IsOptional()
  @IsString()
  comentario?: string;
}
