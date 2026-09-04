import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateRequerimientoItemDto } from './create-requerimiento.dto.js';
import { TipoRequerimiento } from '../../../prisma/types.js';

export class UpdateRequerimientoDto {
  @IsOptional()
  @IsString()
  proyectoId?: string;

  @IsOptional()
  @IsEnum(TipoRequerimiento)
  tipo?: TipoRequerimiento;

  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsBoolean()
  urgente?: boolean;

  @IsOptional()
  @IsString()
  nota?: string;

  @IsOptional()
  @IsDateString()
  fechaEntregaRequerida?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRequerimientoItemDto)
  items?: CreateRequerimientoItemDto[];
}
