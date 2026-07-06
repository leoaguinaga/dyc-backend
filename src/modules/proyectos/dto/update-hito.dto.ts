import { PartialType } from '@nestjs/mapped-types';
import { CreateHitoDto } from './create-hito.dto.js';

export class UpdateHitoDto extends PartialType(CreateHitoDto) {}
