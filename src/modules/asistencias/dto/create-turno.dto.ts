import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateTurnoDto {
  @IsString()
  @IsNotEmpty()
  turnoConfigId: string;

  @IsOptional()
  @IsDateString()
  fecha?: string;

  @IsOptional()
  @IsString()
  @MinLength(5, { message: 'El motivo debe tener al menos 5 caracteres' })
  motivo?: string;
}
