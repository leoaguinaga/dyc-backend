import { IsDateString, IsNumber, Min } from 'class-validator';

export class CreatePlanillaDto {
  @IsDateString()
  desde: string;

  @IsDateString()
  hasta: string;

  @IsNumber()
  @Min(0)
  valorHoraExtra: number;
}
