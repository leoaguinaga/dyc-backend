import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { ProveedoresService } from './proveedores.service.js';
import { CreateProveedorDto } from './dto/create-proveedor.dto.js';
import { UpdateProveedorDto } from './dto/update-proveedor.dto.js';
import { QueryProveedorDto } from './dto/query-proveedor.dto.js';
import { CreateContactoProveedorDto } from './dto/create-contacto-proveedor.dto.js';
import { UpdateContactoProveedorDto } from './dto/update-contacto-proveedor.dto.js';
import { CreateCatalogoItemDto, UpdateCatalogoItemDto } from './dto/create-catalogo-item.dto.js';

@Controller('proveedores')
@Roles('administrador', 'logistica')
export class ProveedoresController {
  constructor(private proveedoresService: ProveedoresService) {}

  @Get()
  findAll(@Query() query: QueryProveedorDto) {
    return this.proveedoresService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.proveedoresService.findOne(id);
  }

  @Post()
  @Roles('administrador')
  create(@Body() dto: CreateProveedorDto) {
    return this.proveedoresService.create(dto);
  }

  @Patch(':id')
  @Roles('administrador')
  update(@Param('id') id: string, @Body() dto: UpdateProveedorDto) {
    return this.proveedoresService.update(id, dto);
  }

  // --- Contactos ---

  @Get(':id/contactos')
  findContactos(@Param('id') id: string) {
    return this.proveedoresService.findContactos(id);
  }

  @Post(':id/contactos')
  @Roles('administrador')
  createContacto(@Param('id') id: string, @Body() dto: CreateContactoProveedorDto) {
    return this.proveedoresService.createContacto(id, dto);
  }

  @Patch(':id/contactos/:contactoId')
  @Roles('administrador')
  updateContacto(
    @Param('id') id: string,
    @Param('contactoId') contactoId: string,
    @Body() dto: UpdateContactoProveedorDto,
  ) {
    return this.proveedoresService.updateContacto(id, contactoId, dto);
  }

  @Patch(':id/contactos/:contactoId/principal')
  @Roles('administrador')
  setPrincipalContacto(
    @Param('id') id: string,
    @Param('contactoId') contactoId: string,
  ) {
    return this.proveedoresService.setPrincipalContacto(id, contactoId);
  }

  // --- Ítems solicitados ---

  @Get(':id/items-solicitados')
  findItemsSolicitados(@Param('id') id: string) {
    return this.proveedoresService.findItemsSolicitados(id);
  }

  @Post(':id/catalogo')
  @Roles('logistica', 'administrador')
  createCatalogoItem(@Param('id') id: string, @Body() dto: CreateCatalogoItemDto) {
    return this.proveedoresService.createCatalogoItem(id, dto);
  }

  @Patch(':id/catalogo/:itemId')
  @Roles('logistica', 'administrador')
  updateCatalogoItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCatalogoItemDto,
  ) {
    return this.proveedoresService.updateCatalogoItem(id, itemId, dto);
  }

  @Delete(':id/catalogo/:itemId')
  @Roles('logistica', 'administrador')
  deleteCatalogoItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.proveedoresService.deleteCatalogoItem(id, itemId);
  }
}
