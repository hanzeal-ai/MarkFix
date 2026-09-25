import { AnnotationFeedController } from './annotation-feed.controller.js';
import { AnnotationFeedService } from './annotation-feed.service.js';
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
import { configuredEmailAdapter, EmailPort } from './email.port.js';
import { SubscriptionController } from './subscription.controller.js';
import { SubscriptionService } from './subscription.service.js';
import { ProjectDataController } from './project-data.controller.js';
import { ProjectDataService } from './project-data.service.js';

const emailProvider = {
  provide: EmailPort,
  useFactory: (): EmailPort => configuredEmailAdapter(process.env, apiServiceUrls().origin),
};

@Module({
  controllers: [
    AnnotationFeedController,
    AgentController,
    AppController,
    CommercialController,
    ProjectDataController,
    SubscriptionController,
  ],
  providers: [
    AnnotationFeedService,
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
