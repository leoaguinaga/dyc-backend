import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Role } from '../../../prisma/types.js';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
