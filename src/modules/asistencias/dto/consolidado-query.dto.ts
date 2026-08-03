import { IsDateString, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ConsolidadoQueryDto {
  @IsDateString()
  desde: string;

  @IsDateString()
  hasta: string;
}

export class PlanillaPreviewQueryDto {
  @IsDateString()
  desde: string;

  @IsDateString()
  hasta: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valorHoraExtra: number;
}

export class ConsolidadoTrabajadorQueryDto {
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;
}
