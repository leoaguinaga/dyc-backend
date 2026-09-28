import { IsOptional, IsString } from 'class-validator';

export class RecepcionRequerimientoDto {
  @IsOptional()
  @IsString()
  fotoUrl?: string;

  @IsOptional()
  @IsString()
  comentario?: string;
}
