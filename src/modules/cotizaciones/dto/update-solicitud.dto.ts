import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EstadoSolicitud } from '../../../prisma/types.js';
import { CreateSolicitudItemDto } from './create-solicitud.dto.js';

export class UpdateSolicitudDto {
  @IsOptional()
  @IsEnum(EstadoSolicitud)
  estado?: EstadoSolicitud;

  @IsOptional()
  @IsString()
  nota?: string;

  // Reemplaza por completo los ítems de la solicitud (ver reglas de estado/rol
  // en CotizacionesService.updateSolicitud).
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSolicitudItemDto)
  items?: CreateSolicitudItemDto[];
}
