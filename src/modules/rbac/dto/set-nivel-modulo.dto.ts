import { IsIn, ValidateIf } from 'class-validator';
import { NIVELES_ACCESO, type NivelAcceso } from '../modulos.js';

export class SetNivelModuloDto {
  /** null quita la excepción y vuelve a mandar lo que define el código. */
  @ValidateIf((_, valor) => valor !== null)
  @IsIn(NIVELES_ACCESO)
  nivel: NivelAcceso | null;
}
