import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseService } from './database.service.js';

@Module({ controllers: [AppController], providers: [AppService, DatabaseService] })
export class AppModule {}
