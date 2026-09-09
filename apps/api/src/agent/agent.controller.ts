import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  ForbiddenException,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createReadStream } from 'node:fs';
import { AppService } from '../app.service.js';
import { AuthRateLimitService } from '../auth-rate-limit.service.js';
import { CurrentUser, type AuthenticatedUser } from '../current-user.decorator.js';
import { Public } from '../public.decorator.js';
import { AgentAuthService } from './agent-auth.service.js';
import { AgentProjectService } from './agent-project.service.js';
import { AgentFixService } from './agent-fix.service.js';
@Controller('v1/agent')
export class AgentController {
  constructor(
    @Inject(AgentAuthService) private readonly auth: AgentAuthService,
    @Inject(AgentProjectService) private readonly projects: AgentProjectService,
    @Inject(AgentFixService) private readonly fixes: AgentFixService,
    @Inject(AuthRateLimitService) private readonly limits: AuthRateLimitService,
    @Inject(AppService) private readonly app: AppService,
  ) {}
  @Public()
  @Post('device')
  begin(@Req() request: FastifyRequest, @Body() body: unknown) {
    this.limits.consume('agent-device', request.ip, 10, 600_000);
    return this.auth.begin(body);
  }
  @Public()
  @Post('token')
  poll(@Req() request: FastifyRequest, @Body() body: unknown) {
    this.limits.consume('agent-token', request.ip, 150, 600_000);
    return this.auth.poll(body);
  }
  @Public()
  @Post('token/refresh')
  refresh(@Req() request: FastifyRequest, @Body() body: unknown) {
    this.limits.consume('agent-refresh', request.ip, 60, 600_000);
    return this.auth.refresh(body);
  }
  @Get('device/:code')
  preview(@Req() request: FastifyRequest, @Param('code') code: string) {
    this.limits.consume('agent-preview', request.ip, 30, 600_000);
    return this.auth.preview(code);
  }
  @Post('device/decision')
  decision(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('origin') origin: string | undefined,
    @Body() body: unknown,
  ) {
    this.limits.consume('agent-decision', user.id, 30, 600_000);
    const allowed = (process.env.MARKFIX_DASHBOARD_ORIGIN ?? 'http://localhost:4311').split(',');
    if (!origin || !allowed.includes(origin))
      throw new ForbiddenException('Authorize from the MarkFix website');
    return this.auth.decide(user.id, body);
  }
  @Get('grants') list(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.list(user.id);
  }
  @Delete('grants/:id') revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.auth.revoke(user.id, id);
  }
  @Get('projects/:id/repositories') repositories(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.projects.repositories(user.id, id);
  }
  @Get('projects/:id/binding') binding(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.projects.binding(user.id, id);
  }
  @Patch('projects/:id/binding') bind(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.projects.bind(user.id, id, body);
  }
  @Public() @Get('status') async status(@Headers('authorization') header: string | undefined) {
    const grant = await this.auth.authenticate(header);
    return {
      authorized: true,
      grantId: grant.id,
      deviceName: grant.deviceName,
      expiresAt: grant.expiresAt,
      projects: await this.projects.listProjects(grant),
    };
  }
  @Public() @Post('logout') async logout(@Headers('authorization') header: string | undefined) {
    const grant = await this.auth.authenticate(header);
    return this.auth.revoke(grant.userId, grant.id);
  }
  @Public() @Post('repositories') async register(
    @Headers('authorization') header: string | undefined,
    @Body() body: unknown,
  ) {
    return this.projects.register(await this.auth.authenticate(header), body);
  }
  @Public() @Get('projects') async projectList(
    @Headers('authorization') header: string | undefined,
  ) {
    return this.projects.listProjects(await this.auth.authenticate(header));
  }
  @Public() @Get('repositories/:id/projects') async resolve(
    @Headers('authorization') header: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.projects.resolve(await this.auth.authenticate(header), id);
  }
  @Public() @Get('issues') async issues(
    @Headers('authorization') header: string | undefined,
    @Query() query: unknown,
  ) {
    return this.fixes.list(await this.auth.authenticate(header), query);
  }
  @Public() @Get('issues/:id') async issue(
    @Headers('authorization') header: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.fixes.get(await this.auth.authenticate(header), id);
  }
  @Public() @Get('issues/:id/screenshot') async screenshot(
    @Headers('authorization') header: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() reply: FastifyReply,
  ) {
    const grant = await this.auth.authenticate(header);
    const report = await this.fixes.get(grant, id);
    if (!report.screenshotPath) return reply.status(404).send({ message: 'Screenshot not found' });
    const artifact = await this.app.getArtifact(grant.userId, report.screenshotPath);
    return reply
      .header('Cache-Control', 'no-store')
      .type('image/png')
      .send(createReadStream(artifact.path));
  }
  @Public() @Post('issues/:id/claim') async claim(
    @Headers('authorization') header: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.fixes.claim(await this.auth.authenticate(header), id, body);
  }
  @Public() @Post('fixes/:id/complete') async complete(
    @Headers('authorization') header: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.fixes.finish(await this.auth.authenticate(header), id, 'SUCCEEDED', body);
  }
  @Public() @Post('fixes/:id/fail') async fail(
    @Headers('authorization') header: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.fixes.finish(await this.auth.authenticate(header), id, 'FAILED', body);
  }
  @Public() @Post('fixes/:id/renew') async renew(
    @Headers('authorization') header: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.fixes.renew(await this.auth.authenticate(header), id);
  }
  @Public() @Post('fixes/:id/release') async release(
    @Headers('authorization') header: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.fixes.release(await this.auth.authenticate(header), id);
  }
}
