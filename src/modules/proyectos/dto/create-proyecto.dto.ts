import {
  IsDateString,
  IsEnum,
  IsInt,
  Min,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
} from 'class-validator';
import {
  AmbitoGeografico,
  CategoriaServicioProyecto,
  EstadoProyecto,
} from '../../../prisma/types.js';

export class CreateProyectoDto {
  @IsOptional()
  @IsInt()
  anio?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  correlativo?: number;

  @IsOptional()
  @IsEnum(CategoriaServicioProyecto)
  categoriaServicio?: CategoriaServicioProyecto;

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
  @IsUrl()
  enlaceOneDrive?: string;

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
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'jornadaInicio debe tener formato HH:mm',
  })
  jornadaInicio?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'jornadaFin debe tener formato HH:mm',
  })
  jornadaFin?: string;

  @IsOptional()
  @IsInt()
  toleranciaMinutos?: number;

  @IsOptional()
  @IsInt()
  toleranciaSalidaMinutos?: number;

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
