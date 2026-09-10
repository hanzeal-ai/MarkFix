import { apiServiceUrls } from './service-config.js';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { maximumArtifactBytes } from './artifact-upload.js';

const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({ bodyLimit: maximumArtifactBytes }),
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
  origin: [apiServiceUrls().origin],
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
});
await app.listen(Number(process.env.PORT ?? 4310), '0.0.0.0');
