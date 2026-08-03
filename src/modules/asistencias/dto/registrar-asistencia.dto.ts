import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EstadoAsistencia } from '../../../prisma/types.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class AsistenciaItemDto {
  @IsString()
  trabajadorId: string;

  @IsEnum(EstadoAsistencia)
  estado: EstadoAsistencia;

  @IsOptional()
  @Matches(HHMM, { message: 'horaLlegadaReal debe tener formato HH:mm' })
  horaLlegadaReal?: string;

  @IsOptional()
  @IsBoolean()
  justificada?: boolean;

  @IsOptional()
  @IsString()
  justificacion?: string;

  @IsOptional()
  @Matches(HHMM, { message: 'salidaTempranaHora debe tener formato HH:mm' })
  salidaTempranaHora?: string;

  @IsOptional()
  @IsString()
  salidaTempranaMotivo?: string;
}

export class RegistrarAsistenciaDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AsistenciaItemDto)
  asistencias: AsistenciaItemDto[];
}
