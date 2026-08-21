import { PartialType } from '@nestjs/mapped-types';
import { CreateHelpVideoDto } from './create-help-video.dto.js';

export class UpdateHelpVideoDto extends PartialType(CreateHelpVideoDto) {}
