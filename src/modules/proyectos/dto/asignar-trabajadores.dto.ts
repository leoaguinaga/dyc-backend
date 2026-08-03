import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
} from 'class-validator';

export class AsignarTrabajadoresDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  trabajadorIds: string[];

  @IsDateString()
  fechaIngreso: string;

  @IsOptional()
  @IsDateString()
  fechaSalida?: string;
}
