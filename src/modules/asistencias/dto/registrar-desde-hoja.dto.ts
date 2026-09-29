import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ObreroHojaDto {
  @IsString()
  trabajadorId: string;

  @Matches(HHMM, { message: 'horaLlegadaReal debe tener formato HH:mm' })
  horaLlegadaReal: string;

  @Matches(HHMM, { message: 'horaSalidaReal debe tener formato HH:mm' })
  horaSalidaReal: string;
}

export class RegistrarDesdeHojaDto {
  @IsString()
  turnoConfigId: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fecha debe tener formato YYYY-MM-DD',
  })
  fecha: string;

  @IsOptional()
  @IsBoolean()
  pagarExtra?: boolean;

  @IsArray()
  @ArrayMinSize(1, { message: 'Agrega al menos un obrero de la hoja' })
  @ValidateNested({ each: true })
  @Type(() => ObreroHojaDto)
  obreros: ObreroHojaDto[];
}
