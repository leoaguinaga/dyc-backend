import { PartialType } from '@nestjs/mapped-types';
import { CreateContactoDto } from './create-contacto.dto.js';

export class UpdateContactoDto extends PartialType(CreateContactoDto) {}
