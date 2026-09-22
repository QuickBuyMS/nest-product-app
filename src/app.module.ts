import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProductsModule } from './products/product.module';
import { DatabaseModule } from './db/database.module';
import { ThrottleConfig } from './throttle/throttle.config';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ProductsModule,
    DatabaseModule,
    ThrottleConfig,
    AiModule, // Phase 1-4: Embeddings, RAG, Agentic tools, Memory
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

