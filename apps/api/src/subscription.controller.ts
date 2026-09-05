import { Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from './current-user.decorator.js';
import { SubscriptionService } from './subscription.service.js';

@Controller('v1/workspaces/:workspaceId/subscription')
export class SubscriptionController {
  constructor(@Inject(SubscriptionService) private readonly subscriptions: SubscriptionService) {}

  @Get()
  subscription(@CurrentUser() user: AuthenticatedUser, @Param('workspaceId') workspaceId: string) {
    return this.subscriptions.getSubscription(user.id, workspaceId);
  }

  @Post('upgrade')
  upgrade(@CurrentUser() user: AuthenticatedUser, @Param('workspaceId') workspaceId: string) {
    return this.subscriptions.requestUpgrade(user.id, workspaceId);
  }
}
