import { IsDateString, IsOptional } from 'class-validator';

export class CreateTurnoDto {
  @IsOptional()
  @IsDateString()
  fecha?: string;
}
