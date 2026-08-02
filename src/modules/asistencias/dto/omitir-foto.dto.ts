import { IsString, MinLength } from 'class-validator';

export class OmitirFotoDto {
  @IsString()
  @MinLength(5)
  motivo: string;
}
