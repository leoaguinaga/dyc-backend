import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ETAPAS_SOLICITUD,
  ORIGENES_SOLICITUD,
  VISTAS_SOLICITUD,
  type EtapaSolicitud,
  type OrigenSolicitud,
  type VistaSolicitud,
} from '../solicitudes.types.js';

export class QuerySolicitudesDto {
  @IsOptional()
  @IsIn(VISTAS_SOLICITUD)
  vista?: VistaSolicitud;

  @IsOptional()
  @IsIn(ORIGENES_SOLICITUD)
  origen?: OrigenSolicitud;

  @IsOptional()
  @IsIn(ETAPAS_SOLICITUD)
  etapa?: EtapaSolicitud;

  @IsOptional()
  @IsString()
  proyectoId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
