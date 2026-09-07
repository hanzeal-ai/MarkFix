import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from './current-user.decorator.js';
import { ProjectDataService } from './project-data.service.js';

const kinds = {
  captures: 'CAPTURE',
  'element-comments': 'ELEMENT_COMMENT',
  diagnostics: 'DIAGNOSTIC',
} as const;

const recordKind = (value: string) => {
  const kind = kinds[value as keyof typeof kinds];
  if (!kind) throw new BadRequestException('Unknown project record kind');
  return kind;
};

@Controller('v1/projects/:projectId/data')
export class ProjectDataController {
  constructor(@Inject(ProjectDataService) private readonly projectData: ProjectDataService) {}

  @Get('state')
  state(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string) {
    return this.projectData.getState(user.id, projectId);
  }

  @Put('state')
  saveState(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ) {
    return this.projectData.saveState(user.id, projectId, body);
  }

  @Get(':kind')
  records(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('kind') kind: string,
  ) {
    return this.projectData.listRecords(user.id, projectId, recordKind(kind));
  }

  @Put(':kind/:recordId')
  saveRecord(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('kind') kind: string,
    @Param('recordId') recordId: string,
    @Body() body: unknown,
  ) {
    if ((body as { id?: unknown })?.id !== recordId)
      throw new BadRequestException('Record ID mismatch');
    return this.projectData.saveRecord(user.id, projectId, recordKind(kind), body);
  }

  @Delete(':kind/:recordId')
  deleteRecord(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('kind') kind: string,
    @Param('recordId') recordId: string,
  ) {
    return this.projectData.deleteRecord(user.id, projectId, recordKind(kind), recordId);
  }

  @Put(':kind/:recordId/images/:slot')
  saveRecordImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('kind') kind: string,
    @Param('recordId') recordId: string,
    @Param('slot') slot: string,
    @Query('updatedAt') updatedAt: string | undefined,
    @Body() body: unknown,
  ) {
    if (slot !== 'rendered' && slot !== 'source')
      throw new BadRequestException('Unknown project record image slot');
    if (!Buffer.isBuffer(body)) throw new BadRequestException('Expected PNG bytes');
    if (!updatedAt || Number.isNaN(Date.parse(updatedAt)))
      throw new BadRequestException('A valid annotation revision is required');
    return this.projectData.saveRecordImage(
      user.id,
      projectId,
      recordKind(kind),
      recordId,
      slot,
      updatedAt,
      Uint8Array.from(body),
    );
  }

  @Put('submission')
  saveSubmission(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ) {
    return this.projectData.saveSubmission(user.id, projectId, body);
  }
}
