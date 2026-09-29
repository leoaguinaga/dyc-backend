import { IsBoolean } from 'class-validator';

export class RevisarCierreDto {
  @IsBoolean()
  pagarExtra!: boolean;
}
