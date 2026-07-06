import { PartialType } from '@nestjs/mapped-types';
import { CreateProveedorDto } from './create-proveedor.dto.js';

export class UpdateProveedorDto extends PartialType(CreateProveedorDto) {}
