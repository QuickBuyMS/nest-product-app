import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as dotenv from 'dotenv';
import { AppModule } from './app.module';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  app.enableCors({
    origin: true,
    credentials: true,
  });

  const port = process.env.PORT || 7002;
  // Bind to 0.0.0.0 so container platforms (Render, Railway, Docker) route public traffic properly
  await app.listen(port, '0.0.0.0');
  console.log(`Server listening on port ${port} at 0.0.0.0/api`);
}
bootstrap();
