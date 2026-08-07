import { IsOptional, IsString } from 'class-validator';

export class ObservarGrupoDto {
  @IsString()
  nota: string;
}

export class AprobarGrupoDto {
  @IsOptional()
  @IsString()
  fechaProgramadaPago?: string;
}
