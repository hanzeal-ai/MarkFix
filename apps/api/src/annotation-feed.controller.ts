import { apiServiceUrls } from './service-config.js';
import {
  ForbiddenException,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CurrentUser, type AuthenticatedUser } from './current-user.decorator.js';
import { Public } from './public.decorator.js';
import { AnnotationFeedService } from './annotation-feed.service.js';
import { AuthRateLimitService } from './auth-rate-limit.service.js';

@Controller('v1')
export class AnnotationFeedController {
  constructor(
    @Inject(AnnotationFeedService) private readonly feeds: AnnotationFeedService,
    @Inject(AuthRateLimitService) private readonly limits: AuthRateLimitService,
  ) {}

  @Get('projects/:projectId/read-authorization')
  @Header('Cache-Control', 'no-store')
  status(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.feeds.status(user.id, projectId);
  }

  @Post('projects/:projectId/read-authorization')
  @Header('Cache-Control', 'no-store')
  authorize(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Headers('origin') origin: string | undefined,
  ) {
    if (origin !== apiServiceUrls().origin)
      throw new ForbiddenException('Authorize from the product website');
    this.limits.consume('annotation-read-grant', user.id, 10, 600_000);
    return this.feeds.authorize(user.id, projectId);
  }

  @Delete('projects/:projectId/read-authorization')
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Headers('origin') origin: string | undefined,
  ) {
    if (origin !== apiServiceUrls().origin)
      throw new ForbiddenException('Authorize from the product website');
    return this.feeds.revoke(user.id, projectId);
  }

  @Public()
  @Get('annotation-feed/:id')
  @Header('Cache-Control', 'no-store')
  read(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('authorization') authorization: string | undefined,
    @Query() query: unknown,
    @Req() request: FastifyRequest,
  ) {
    this.limits.consume('annotation-feed', request.ip, 120, 60_000);
    return this.feeds.read(id, authorization, query);
  }
}
