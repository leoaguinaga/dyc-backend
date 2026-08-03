import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateTurnoDto {
  @IsString()
  @IsNotEmpty()
  turnoConfigId: string;

  @IsOptional()
  @IsDateString()
  fecha?: string;
}
