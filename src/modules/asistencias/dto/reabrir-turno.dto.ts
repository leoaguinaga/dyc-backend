import { IsString, MinLength } from 'class-validator';

export class ReabrirTurnoDto {
  @IsString()
  @MinLength(5, { message: 'El motivo debe tener al menos 5 caracteres' })
  motivo: string;
}
