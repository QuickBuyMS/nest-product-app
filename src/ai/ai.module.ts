import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { ProductsModule } from '../products/product.module';

// Phase 1 — Embeddings
import { EmbeddingsService } from './embeddings/embeddings.service';
import { EmbeddingsController } from './embeddings/embeddings.controller';

// Phase 2 — RAG
import { RagService } from './rag/rag.service';
import { RagController } from './rag/rag.controller';

// Phase 4 — Memory
import { MemoryService } from './memory/memory.service';
import { MemoryController } from './memory/memory.controller';

// Phase 5 — Comparison
import { ComparisonService } from './comparison/comparison.service';
import { ComparisonController } from './comparison/comparison.controller';

/**
 * AiModule — central module for all AI/RAG/Agent features
 *
 * Dependency graph:
 *   AiModule
 *   ├── RedisModule        (vector storage, memory, caching)
 *   └── ProductsModule     (DB access for batch indexing)
 *       └── DatabaseModule (MySQL connection pool)
 *
 * LEARNING:
 *   NestJS's DI system lets each service declare its dependencies in the
 *   constructor. The module's `imports` array makes other modules' exports
 *   available here. This is why ProductRepository can be injected into
 *   EmbeddingsService without any additional wiring.
 *
 * ╔══════════════════ GOLD STANDARD ALTERNATIVE ═══════════════════════════════╗
 * ║  For large AI features, consider a dedicated microservice:                 ║
 * ║  → Separate NestJS app for AI (different scaling profile than catalogue)  ║
 * ║  → Communicate via gRPC or NestJS microservice transport (TCP/NATS)       ║
 * ║  → Allows independent deployment and GPU-specific infrastructure           ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
 */
@Module({
  imports: [
    RedisModule,    // Provides RedisService (vector index + memory storage)
    ProductsModule, // Provides ProductRepository (batch product ingestion)
  ],
  controllers: [
    EmbeddingsController, // POST /ai/embeddings/index-all, GET /ai/embeddings/status
    RagController,        // GET /ai/search, POST /ai/rag
    MemoryController,     // GET/POST/DELETE /ai/memory/:userId
    ComparisonController, // GET /ai/compare/:productId
  ],
  providers: [
    EmbeddingsService,  // Phase 1: Vector generation + Redis indexing
    RagService,         // Phase 2: Semantic search + RAG answer generation
    MemoryService,      // Phase 4: Long-term user preference storage
    ComparisonService,  // Phase 5: AI product comparison
  ],
  exports: [
    EmbeddingsService, // Exported so other modules can call generateEmbedding()
    RagService,        // Exported for potential use by other services
    MemoryService,     // Exported for preference injection
    ComparisonService, // Exported for comparison use
  ],
})
export class AiModule {}
