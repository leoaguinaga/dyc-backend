import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class QueryProveedorDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  activo?: boolean;
}
