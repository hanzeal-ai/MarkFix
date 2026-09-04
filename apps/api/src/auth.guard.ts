import {
  CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { AuthService } from './auth.service.js';
import type { AuthenticatedUser } from './current-user.decorator.js';
import { publicRouteKey } from './public.decorator.js';

const cookieToken = (cookieHeader: string | undefined): string | undefined => {
  const value = cookieHeader
    ?.split(';')
    .map((part) => part.trim().split('='))
    .find(([name]) => name === 'markfix_access')
    ?.slice(1)
    .join('=');
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(publicRouteKey, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const authorization = request.headers.authorization;
    const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    const token = bearer ?? cookieToken(request.headers.cookie);
    if (!token) throw new UnauthorizedException('Authentication is required');
    const claims = await this.auth.authenticate(token);
    (request as FastifyRequest & { user: AuthenticatedUser }).user = {
      id: claims.sub,
      sessionId: claims.sid,
    };
    return true;
  }
}
