import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { QueryReporteDinamicoDto } from './query-reporte-dinamico.dto.js';

export class CreateReporteGuardadoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  @ValidateNested()
  @Type(() => QueryReporteDinamicoDto)
  query: QueryReporteDinamicoDto;

  /** Visible para todos los que tienen acceso a Reportes, no solo para quien lo creó. */
  @IsOptional()
  @IsBoolean()
  compartido?: boolean;
}

export class UpdateReporteGuardadoDto extends PartialType(
  CreateReporteGuardadoDto,
) {}
