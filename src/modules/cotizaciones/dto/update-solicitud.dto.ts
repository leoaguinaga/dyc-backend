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

export class UpdateSolicitudItemDto extends CreateSolicitudItemDto {
  // Id del ítem existente: se actualiza en sitio para no romper las
  // cotizaciones que ya lo referencian. Sin id se crea un ítem nuevo.
  @IsOptional()
  @IsString()
  id?: string;
}

export class UpdateSolicitudDto {
  @IsOptional()
  @IsEnum(EstadoSolicitud)
  estado?: EstadoSolicitud;

  @IsOptional()
  @IsString()
  nota?: string;

  // Reemplaza el conjunto de ítems de la solicitud (ver reglas de estado/rol
  // en CotizacionesService.updateSolicitud).
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateSolicitudItemDto)
  items?: UpdateSolicitudItemDto[];
}
