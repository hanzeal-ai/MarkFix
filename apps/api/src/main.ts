import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';

const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({ bodyLimit: 21 * 1024 * 1024 }),
  {
    logger: ['error', 'warn', 'log'],
  },
);
app
  .getHttpAdapter()
  .getInstance()
  .addContentTypeParser('image/png', { parseAs: 'buffer' }, (_request, body, done) =>
    done(null, body),
  );
app.enableCors({
  origin: (process.env.MARKFIX_DASHBOARD_ORIGIN ?? 'http://localhost:4311').split(','),
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
});
await app.listen(Number(process.env.PORT ?? 4310), '0.0.0.0');
