import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateTurnoConfigDto } from './create-turno-config.dto.js';

export class UpdateTurnoConfigDto extends PartialType(CreateTurnoConfigDto) {
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
