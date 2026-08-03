import { IsBoolean, IsOptional } from 'class-validator';

export class CerrarTurnoDto {
  @IsOptional()
  @IsBoolean()
  pagarExtra?: boolean;
}
