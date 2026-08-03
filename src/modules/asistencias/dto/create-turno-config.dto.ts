import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateTurnoConfigDto {
  @IsString()
  @MinLength(1)
  nombre: string;

  @Matches(HORA_REGEX, { message: 'horaInicio debe tener formato HH:mm' })
  horaInicio: string;

  @Matches(HORA_REGEX, { message: 'horaFin debe tener formato HH:mm' })
  horaFin: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  toleranciaMinutos?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  toleranciaSalidaMinutos?: number;
}
