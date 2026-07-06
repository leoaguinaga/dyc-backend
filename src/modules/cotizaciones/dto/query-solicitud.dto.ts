import { IsEnum, IsOptional, IsString } from 'class-validator';
import { EstadoSolicitud } from '../../../prisma/types.js';

export class QuerySolicitudDto {
  @IsOptional()
  @IsEnum(EstadoSolicitud)
  estado?: EstadoSolicitud;

  @IsOptional()
  @IsString()
  proyectoId?: string;
}
