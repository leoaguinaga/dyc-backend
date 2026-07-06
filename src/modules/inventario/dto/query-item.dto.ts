import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { TipoItem } from '../../../prisma/types.js';

export class QueryItemDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  categoria?: string;

  @IsOptional()
  @IsEnum(TipoItem)
  tipo?: TipoItem;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  activo?: boolean;
}
