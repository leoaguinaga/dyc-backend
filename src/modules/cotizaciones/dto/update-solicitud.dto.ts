import { IsEnum, IsOptional, IsString } from 'class-validator';
import { EstadoSolicitud } from '../../../prisma/types.js';

export class UpdateSolicitudDto {
  @IsOptional()
  @IsEnum(EstadoSolicitud)
  estado?: EstadoSolicitud;

  @IsOptional()
  @IsString()
  nota?: string;
}
