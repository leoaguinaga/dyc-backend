import { All, Controller, Req, Res } from '@nestjs/common';
import { toNodeHandler } from 'better-auth/node';
import type { Request, Response } from 'express';
import { Public } from '../../shared/decorators/public.decorator.js';
import { AuthService } from './auth.service.js';

@Controller()
@Public()
export class AuthController {
  constructor(private authService: AuthService) {}

  @All('/auth/*splat')
  async handleAuth(@Req() req: Request, @Res() res: Response) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return toNodeHandler(this.authService.auth)(req, res);
  }
}
