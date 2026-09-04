import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { ClientPolicyService } from './client-policy.service.js';
import { DatabaseService } from './database.service.js';

@Module({
  controllers: [AppController],
  providers: [
    AppService,
    AuthService,
    ClientPolicyService,
    DatabaseService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
