import { IsOptional, IsString } from 'class-validator';

export class CancelarRequerimientoDto {
  @IsOptional()
  @IsString()
  motivo?: string;
}
