import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { createReadStream } from 'node:fs';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppService } from './app.service.js';
import { AuthService } from './auth.service.js';
import { AuthRateLimitService } from './auth-rate-limit.service.js';
import { ClientPolicyService } from './client-policy.service.js';
import { CurrentUser, type AuthenticatedUser } from './current-user.decorator.js';
import { Public } from './public.decorator.js';
import { SubscriptionService } from './subscription.service.js';

const cookie = (name: string, value: string, maxAge: number): string =>
  `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${
    process.env.NODE_ENV === 'production' ? '; Secure' : ''
  }`;

const clearCookie = (name: string): string =>
  `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${
    process.env.NODE_ENV === 'production' ? '; Secure' : ''
  }`;

const decodeCookie = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
};

const cookies = (header: string | undefined): Record<string, string> =>
  Object.fromEntries(
    (header ?? '')
      .split(';')
      .map((part) => part.trim().split('='))
      .filter(([name]) => Boolean(name))
      .map(([name, ...value]) => [name, decodeCookie(value.join('='))]),
  );

@Controller('v1')
export class AppController {
  constructor(
    @Inject(AppService) private readonly app: AppService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AuthRateLimitService) private readonly authRateLimit: AuthRateLimitService,
    @Inject(ClientPolicyService) private readonly clientPolicy: ClientPolicyService,
    @Inject(SubscriptionService) private readonly subscriptions: SubscriptionService,
  ) {}

  @Get('health')
  @Public()
  health() {
    return { status: 'ok', version: '0.1.0' };
  }

  @Get('client-policy')
  @Public()
  policy(@Query('version') version: string | undefined) {
    return this.clientPolicy.getPolicy(version);
  }

  @Get('desktop-updates')
  @Public()
  @Header('Cache-Control', 'no-store')
  desktopUpdate(
    @Query('version') version: string | undefined,
    @Query('platform') platform: string | undefined,
    @Query('arch') arch: string | undefined,
    @Res() reply: FastifyReply,
  ) {
    const update = this.clientPolicy.getUpdate(version, platform, arch);
    return update ? reply.send(update) : reply.code(204).send();
  }

  @Get('bootstrap')
  bootstrap(@CurrentUser() user: AuthenticatedUser) {
    return this.app.bootstrap(user.id);
  }

  @Post('auth/register')
  @Public()
  register(@Req() request: FastifyRequest, @Body() body: unknown) {
    this.authRateLimit.consume('register', request.ip, 8, 60 * 60 * 1000);
    return this.auth.register(body);
  }

  @Post('auth/verify-email')
  @Public()
  verifyEmail(@Req() request: FastifyRequest, @Body() body: unknown) {
    this.authRateLimit.consume('verify-email', request.ip, 20, 60 * 60 * 1000);
    return this.auth.verifyEmail(body);
  }

  @Post('auth/forgot-password')
  @Public()
  forgotPassword(@Req() request: FastifyRequest, @Body() body: unknown) {
    this.authRateLimit.consume('forgot-password', request.ip, 5, 60 * 60 * 1000);
    return this.auth.forgotPassword(body);
  }

  @Post('auth/reset-password')
  @Public()
  resetPassword(@Req() request: FastifyRequest, @Body() body: unknown) {
    this.authRateLimit.consume('reset-password', request.ip, 10, 60 * 60 * 1000);
    return this.auth.resetPassword(body);
  }

  @Post('auth/login')
  @Public()
  async login(
    @Req() request: FastifyRequest,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    this.authRateLimit.consume('login', request.ip, 20, 15 * 60 * 1000);
    const tokens = await this.auth.login(body);
    const desktop = (body as { clientType?: unknown }).clientType === 'desktop';
    if (desktop) return tokens;
    reply.header('Set-Cookie', [
      cookie('markfix_access', tokens.accessToken, tokens.expiresIn),
      cookie('markfix_refresh', tokens.refreshToken, 30 * 24 * 60 * 60),
    ]);
    return { expiresIn: tokens.expiresIn };
  }

  @Post('auth/refresh')
  @Public()
  async refresh(
    @Body() body: unknown,
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const payload = body as { refreshToken?: unknown };
    const refreshToken =
      typeof payload.refreshToken === 'string'
        ? payload.refreshToken
        : cookies(cookieHeader).markfix_refresh;
    const tokens = await this.auth.refresh({ refreshToken });
    if (typeof payload.refreshToken === 'string') return tokens;
    reply.header('Set-Cookie', [
      cookie('markfix_access', tokens.accessToken, tokens.expiresIn),
      cookie('markfix_refresh', tokens.refreshToken, 30 * 24 * 60 * 60),
    ]);
    return { expiresIn: tokens.expiresIn };
  }

  @Post('auth/logout')
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.auth.logout(user.id, user.sessionId);
    reply.header('Set-Cookie', [clearCookie('markfix_access'), clearCookie('markfix_refresh')]);
    return result;
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.id);
  }

  @Get('me/export')
  exportData(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.exportData(user.id);
  }

  @Delete('me')
  async deleteAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.auth.deleteAccount(user.id, body);
    reply.header('Set-Cookie', [clearCookie('markfix_access'), clearCookie('markfix_refresh')]);
    return result;
  }

  @Get('me/sessions')
  sessions(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.sessions(user.id);
  }

  @Delete('me/sessions/:sessionId')
  revokeSession(@CurrentUser() user: AuthenticatedUser, @Param('sessionId') sessionId: string) {
    return this.auth.revokeSession(user.id, sessionId);
  }

  @Get('workspaces')
  workspaces(@CurrentUser() user: AuthenticatedUser) {
    return this.app.listWorkspaces(user.id);
  }

  @Post('workspaces')
  createWorkspace(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.app.createWorkspace(user.id, body);
  }

  @Get('workspaces/:workspaceId/projects')
  projects(@CurrentUser() user: AuthenticatedUser, @Param('workspaceId') workspaceId: string) {
    return this.app.listProjects(user.id, workspaceId);
  }

  @Post('workspaces/:workspaceId/projects')
  async createProject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body() body: unknown,
  ) {
    await this.subscriptions.assertCanCreateProject(user.id, workspaceId);
    return this.app.createProject(user.id, workspaceId, body);
  }

  @Get('projects/:projectId')
  project(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string) {
    return this.app.getProject(user.id, projectId);
  }

  @Patch('projects/:projectId')
  updateProject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ) {
    return this.app.updateProject(user.id, projectId, body);
  }

  @Delete('projects/:projectId')
  deleteProject(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string) {
    return this.app.deleteProject(user.id, projectId);
  }

  @Get('projects/:projectId/environments')
  environments(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string) {
    return this.app.listEnvironments(user.id, projectId);
  }

  @Post('projects/:projectId/environments')
  createEnvironment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ) {
    return this.app.createEnvironment(user.id, projectId, body);
  }

  @Patch('environments/:environmentId')
  updateEnvironment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('environmentId') environmentId: string,
    @Body() body: unknown,
  ) {
    return this.app.updateEnvironment(user.id, environmentId, body);
  }

  @Get('workspaces/:workspaceId/members')
  members(@CurrentUser() user: AuthenticatedUser, @Param('workspaceId') workspaceId: string) {
    return this.app.listMembers(user.id, workspaceId);
  }

  @Get('workspaces/:workspaceId/invitations')
  invitations(@CurrentUser() user: AuthenticatedUser, @Param('workspaceId') workspaceId: string) {
    return this.app.listInvitations(user.id, workspaceId);
  }

  @Post('workspaces/:workspaceId/invitations')
  async invite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body() body: unknown,
  ) {
    await this.subscriptions.assertCanInviteMember(user.id, workspaceId);
    return this.app.createInvitation(user.id, workspaceId, body);
  }

  @Post('invitations/:token/accept')
  acceptInvitation(@CurrentUser() user: AuthenticatedUser, @Param('token') token: string) {
    return this.app.acceptInvitation(user.id, token);
  }

  @Post('projects/:projectId/report-submissions')
  createSubmission(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    return this.app.createSubmission(
      user.id,
      projectId,
      idempotencyKey ?? crypto.randomUUID(),
      body,
    );
  }

  @Post('report-submissions/:submissionId/artifacts/presign')
  presign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('submissionId') submissionId: string,
    @Body() body: unknown,
  ) {
    return this.app.presignArtifact(user.id, submissionId, body);
  }

  @Put('uploads/:artifactId')
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('artifactId') artifactId: string,
    @Body() body: unknown,
  ) {
    return this.app.uploadArtifact(user.id, artifactId, body);
  }

  @Post('report-submissions/:submissionId/finalize')
  finalize(@CurrentUser() user: AuthenticatedUser, @Param('submissionId') submissionId: string) {
    return this.app.finalizeSubmission(user.id, submissionId);
  }

  @Get('projects/:projectId/reports')
  listReports(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query()
    query: {
      status?: string;
      priority?: string;
      assigneeId?: string;
      pageUrl?: string;
      cursor?: string;
      limit?: string;
    },
  ) {
    return this.app.listReports(user.id, projectId, query);
  }

  @Get('reports/:reportId')
  getReport(@CurrentUser() user: AuthenticatedUser, @Param('reportId') reportId: string) {
    return this.app.getReport(user.id, reportId);
  }

  @Post('reports/:reportId/comments')
  addComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId') reportId: string,
    @Body() body: unknown,
  ) {
    return this.app.addComment(user.id, reportId, body);
  }

  @Post('reports/:reportId/transitions')
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId') reportId: string,
    @Body() body: unknown,
  ) {
    return this.app.transition(user.id, reportId, body);
  }

  @Patch('reports/:reportId')
  updateReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId') reportId: string,
    @Body() body: unknown,
  ) {
    return this.app.updateReport(user.id, reportId, body);
  }

  @Get('artifacts/:artifactId')
  @Header('Content-Type', 'image/png')
  async artifact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('artifactId') artifactId: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() reply: FastifyReply,
  ) {
    const artifact = await this.app.getArtifact(user.id, artifactId);
    reply.header('Cache-Control', 'private, max-age=86400');
    reply.header('ETag', artifact.etag);
    if (ifNoneMatch === artifact.etag) return reply.status(304).send();
    return reply.send(createReadStream(artifact.path));
  }
}
