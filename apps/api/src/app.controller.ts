import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { AppService } from './app.service.js';

@Controller('v1')
export class AppController {
  constructor(private readonly app: AppService) {}

  @Get('health')
  health() {
    return { status: 'ok', version: '0.1.0' };
  }

  @Get('bootstrap')
  bootstrap() {
    return this.app.bootstrap();
  }

  @Get('workspaces/:workspaceId/members')
  members(@Param('workspaceId') workspaceId: string) {
    return this.app.listMembers(workspaceId);
  }

  @Get('workspaces/:workspaceId/invitations')
  invitations(@Param('workspaceId') workspaceId: string) {
    return this.app.listInvitations(workspaceId);
  }

  @Post('workspaces/:workspaceId/invitations')
  invite(@Param('workspaceId') workspaceId: string, @Body() body: unknown) {
    return this.app.createInvitation(workspaceId, body);
  }

  @Post('invitations/:token/accept')
  acceptInvitation(@Param('token') token: string, @Body() body: unknown) {
    return this.app.acceptInvitation(token, body);
  }

  @Post('projects/:projectId/report-submissions')
  createSubmission(
    @Param('projectId') projectId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    return this.app.createSubmission(projectId, idempotencyKey ?? crypto.randomUUID(), body);
  }

  @Post('report-submissions/:submissionId/artifacts/presign')
  presign(@Param('submissionId') submissionId: string, @Body() body: unknown) {
    return this.app.presignArtifact(submissionId, body);
  }

  @Put('uploads/:artifactId')
  upload(@Param('artifactId') artifactId: string, @Body() body: unknown) {
    return this.app.uploadArtifact(artifactId, body);
  }

  @Post('report-submissions/:submissionId/finalize')
  finalize(@Param('submissionId') submissionId: string) {
    return this.app.finalizeSubmission(submissionId);
  }

  @Get('projects/:projectId/reports')
  listReports(
    @Param('projectId') projectId: string,
    @Query()
    query: {
      status?: string;
      priority?: string;
      assigneeId?: string;
      cursor?: string;
      limit?: string;
    },
  ) {
    return this.app.listReports(projectId, query);
  }

  @Get('reports/:reportId')
  getReport(@Param('reportId') reportId: string) {
    return this.app.getReport(reportId);
  }

  @Post('reports/:reportId/comments')
  addComment(@Param('reportId') reportId: string, @Body() body: unknown) {
    return this.app.addComment(reportId, body);
  }

  @Post('reports/:reportId/transitions')
  transition(@Param('reportId') reportId: string, @Body() body: unknown) {
    return this.app.transition(reportId, body);
  }

  @Patch('reports/:reportId')
  updateReport(@Param('reportId') reportId: string, @Body() body: unknown) {
    return this.app.updateReport(reportId, body);
  }

  @Get('artifacts/:artifactId')
  @Header('Content-Type', 'image/png')
  async artifact(@Param('artifactId') artifactId: string, @Res() reply: FastifyReply) {
    return reply.send(await this.app.getArtifact(artifactId));
  }
}
