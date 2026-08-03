import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

const TIPOS_PERSONA = [
  'operario',
  'staff',
  'staff_oficina',
  'tercero',
] as const;

export class ControlAccesoGlobalQueryDto {
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;

  @IsOptional()
  @IsString()
  proyectoId?: string;

  @IsOptional()
  @IsIn(TIPOS_PERSONA)
  tipo?: (typeof TIPOS_PERSONA)[number];
}

export class PlanillasGlobalQueryDto {
  @IsOptional()
  @IsString()
  proyectoId?: string;

  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;
}
