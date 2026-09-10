import { apiServiceUrls } from './service-config.js';
import { AgentController } from './agent/agent.controller.js';
import { AgentAuthService } from './agent/agent-auth.service.js';
import { AgentProjectService } from './agent/agent-project.service.js';
import { AgentFixService } from './agent/agent-fix.service.js';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthGuard } from './auth.guard.js';
import { AuthRateLimitService } from './auth-rate-limit.service.js';
import { AuthService } from './auth.service.js';
import { ClientPolicyService } from './client-policy.service.js';
import { CommercialController } from './commercial.controller.js';
import { CommercialService } from './commercial.service.js';
import { DatabaseService } from './database.service.js';
import { DevelopmentEmailAdapter, EmailPort, WebhookEmailAdapter } from './email.port.js';
import { SubscriptionController } from './subscription.controller.js';
import { SubscriptionService } from './subscription.service.js';
import { ProjectDataController } from './project-data.controller.js';
import { ProjectDataService } from './project-data.service.js';

const emailProvider = {
  provide: EmailPort,
  useFactory: (): EmailPort => {
    const endpoint = process.env.MARKFIX_EMAIL_WEBHOOK_URL;
    if (endpoint) {
      return new WebhookEmailAdapter(
        endpoint,
        process.env.MARKFIX_EMAIL_WEBHOOK_API_KEY,
        apiServiceUrls().origin,
      );
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MARKFIX_EMAIL_WEBHOOK_URL is required in production');
    }
    return new DevelopmentEmailAdapter();
  },
};

@Module({
  controllers: [
    AgentController,
    AppController,
    CommercialController,
    ProjectDataController,
    SubscriptionController,
  ],
  providers: [
    AgentAuthService,
    AgentProjectService,
    AgentFixService,
    AppService,
    AuthService,
    AuthRateLimitService,
    ClientPolicyService,
    CommercialService,
    DatabaseService,
    ProjectDataService,
    SubscriptionService,
    emailProvider,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
