import {
  ArrayMinSize,
  IsArray,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class VisitanteTerceroItemDto {
  @IsString()
  nombre: string;

  @IsString()
  dni: string;
}

export class CreateVisitaTerceroDto {
  @IsString()
  empresaNombre: string;

  @IsString()
  motivo: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => VisitanteTerceroItemDto)
  visitantes: VisitanteTerceroItemDto[];
}
