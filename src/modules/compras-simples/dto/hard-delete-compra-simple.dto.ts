import { IsString, MinLength } from 'class-validator';

export class HardDeleteCompraSimpleDto {
  @IsString()
  @MinLength(1)
  confirmacion!: string;
}
