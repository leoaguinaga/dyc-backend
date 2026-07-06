import { PartialType } from '@nestjs/mapped-types';
import { CreateContactoProveedorDto } from './create-contacto-proveedor.dto.js';

export class UpdateContactoProveedorDto extends PartialType(CreateContactoProveedorDto) {}
