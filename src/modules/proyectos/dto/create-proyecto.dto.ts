import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { EstadoProyecto, AmbitoGeografico } from '../../../prisma/types.js';

export class CreateProyectoDto {
  @IsOptional()
  @IsString()
  codigo?: string;

  @IsString()
  nombre: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  clienteId?: string;

  @IsOptional()
  @IsString()
  ciudad?: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsString()
  comuna?: string;

  @IsOptional()
  @IsEnum(AmbitoGeografico)
  ambitoGeografico?: AmbitoGeografico;

  @IsOptional()
  @IsString()
  coordinadorClienteId?: string;

  @IsOptional()
  @IsString()
  coordinadorEmpresaId?: string;

  @IsOptional()
  @IsString()
  ejecutorId?: string;

  @IsOptional()
  @IsString()
  prevencionistaId?: string;

  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @IsOptional()
  @IsDateString()
  fechaFin?: string;

  @IsOptional()
  @IsDateString()
  fechaInicioReal?: string;

  @IsOptional()
  @IsDateString()
  fechaFinReal?: string;

  @IsOptional()
  @IsString()
  notaInicioReal?: string;

  @IsOptional()
  @IsEnum(EstadoProyecto)
  estado?: EstadoProyecto;
}
