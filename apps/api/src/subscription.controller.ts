import { Controller, Get, Inject, Post } from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from './current-user.decorator.js';
import { SubscriptionService } from './subscription.service.js';

@Controller('v1/me/subscription')
export class SubscriptionController {
  constructor(@Inject(SubscriptionService) private readonly subscriptions: SubscriptionService) {}

  @Get()
  subscription(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptions.getSubscription(user.id);
  }

  @Post('upgrade')
  upgrade(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptions.requestUpgrade(user.id);
  }
}
