import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { EstadoSolicitud } from '../../../prisma/types.js';
import { ALCANCES_LISTADO, type AlcanceListado } from '../../../shared/alcance/alcance-listado.js';

export class QuerySolicitudDto {
  @IsOptional()
  @IsEnum(EstadoSolicitud)
  estado?: EstadoSolicitud;

  @IsOptional()
  @IsString()
  proyectoId?: string;

  @IsOptional()
  @IsIn(ALCANCES_LISTADO)
  alcance?: AlcanceListado;
}
