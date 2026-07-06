import { PartialType } from '@nestjs/mapped-types';
import { CreateTrabajadorDto } from './create-trabajador.dto.js';

export class UpdateTrabajadorDto extends PartialType(CreateTrabajadorDto) {}
