import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class EditarItemGrupoDto {
  // Si se envía, edita el ítem existente; si no, se crea uno nuevo.
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  descripcion: string;

  @IsNumber()
  @Min(0.01)
  cantidad: number;
}

export class EditarItemsGrupoDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EditarItemGrupoDto)
  items: EditarItemGrupoDto[];
}
