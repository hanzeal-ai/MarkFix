import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { CommercialService } from './commercial.service.js';
import { CurrentUser, type AuthenticatedUser } from './current-user.decorator.js';

@Controller('v1/commercial')
export class CommercialController {
  constructor(@Inject(CommercialService) private readonly commercial: CommercialService) {}

  @Get('bootstrap')
  bootstrap(@CurrentUser() user: AuthenticatedUser) {
    return this.commercial.bootstrap(user.id);
  }

  @Get('workspaces/:workspaceId/overview')
  overview(@CurrentUser() user: AuthenticatedUser, @Param('workspaceId') workspaceId: string) {
    return this.commercial.overview(user.id, workspaceId);
  }

  @Get('projects/:projectId/annotations')
  annotations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.commercial.annotations(user.id, projectId, query);
  }

  @Post('projects/:projectId/annotations')
  createAnnotation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ) {
    return this.commercial.createAnnotation(user.id, projectId, body);
  }

  @Patch('annotations/:annotationId')
  updateAnnotation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('annotationId') annotationId: string,
    @Body() body: unknown,
  ) {
    return this.commercial.updateAnnotation(user.id, annotationId, body);
  }

  @Post('annotations/:annotationId/reject')
  rejectAnnotation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('annotationId') annotationId: string,
    @Body() body: unknown,
  ) {
    return this.commercial.rejectAnnotation(user.id, annotationId, body);
  }

  @Delete('annotations/:annotationId')
  deleteAnnotation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('annotationId') annotationId: string,
  ) {
    return this.commercial.deleteAnnotation(user.id, annotationId);
  }

  @Patch('projects/:projectId/category')
  updateProjectCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ) {
    return this.commercial.updateProjectCategory(user.id, projectId, body);
  }
}
