import { IsDateString, IsOptional } from 'class-validator';

export class QueryReporteRangoDto {
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;
}
