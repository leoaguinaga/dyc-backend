import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateRequerimientoItemDto } from './create-requerimiento.dto.js';

export class UpdateRequerimientoDto {
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
