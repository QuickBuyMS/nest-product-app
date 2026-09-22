import {
  Controller,
  Post,
  Get,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { EmbeddingsService } from './embeddings.service';

/**
 * EmbeddingsController — Phase 1 Learning Module
 *
 * Endpoints:
 *   POST /ai/embeddings/index-all    → Batch-index all products from MySQL into Redis Stack
 *   GET  /ai/embeddings/status       → Check index stats (how many products are indexed)
 *   DELETE /ai/embeddings/:id        → Remove a product's embedding (keep in sync with DB)
 *
 * LEARNING NOTE:
 *   In production, you wouldn't expose POST /index-all as a REST endpoint.
 *   Instead, trigger this via:
 *     1. A scheduled cron job (e.g. nightly re-index)
 *     2. An event-driven pipeline triggered by DB writes
 *     3. A BullMQ background job
 *
 * ╔══════════════════ GOLD STANDARD ALTERNATIVE ═══════════════════════════════╗
 * ║  Production sync patterns:                                                 ║
 * ║  → MySQL binlog CDC (Change Data Capture) → Kafka → Embedding pipeline    ║
 * ║  → Use Debezium connector to detect DB row changes in real-time           ║
 * ║  → This ensures your vector index is never stale (< 1s lag)               ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
 */
@Controller('ai/embeddings')
export class EmbeddingsController {
  private readonly logger = new Logger(EmbeddingsController.name);

  constructor(private readonly embeddingsService: EmbeddingsService) {}

  /**
   * POST /ai/embeddings/index-all
   *
   * LEARNING: This is the "ingestion" phase of RAG.
   * Run this once after seeding your DB with products.
   * The response tells you how many products were embedded + stored in Redis.
   *
   * Internally this:
   *   1. Fetches all products from MySQL
   *   2. Builds a rich text string for each product
   *   3. Calls Google text-embedding-004 API (batched)
   *   4. Stores each embedding as a Redis HASH with the binary vector
   */
  @Post('index-all')
  @HttpCode(HttpStatus.OK)
  async indexAllProducts() {
    this.logger.log('Starting full product index...');
    const result = await this.embeddingsService.indexAllProducts();
    return {
      statusCode: HttpStatus.OK,
      message: 'Product indexing complete',
      data: result,
    };
  }

  /**
   * GET /ai/embeddings/status
   *
   * LEARNING: FT.INFO tells you everything about the index —
   * how many documents are indexed, memory usage, index schema etc.
   * Essential for debugging "why is my search returning wrong results?".
   */
  @Get('status')
  async getIndexStatus() {
    const info = await this.embeddingsService['redisService'].callCommand(
      'FT.INFO',
      'idx:products_v1',
    );

    // FT.INFO returns a flat array of [key, value, key, value, ...]
    // Convert to a readable object
    const parsed: Record<string, any> = {};
    for (let i = 0; i < (info as any[]).length - 1; i += 2) {
      parsed[(info as any[])[i]] = (info as any[])[i + 1];
    }

    return {
      statusCode: HttpStatus.OK,
      message: 'Index status',
      data: {
        index_name: parsed['index_name'],
        num_docs: parsed['num_docs'],
        doc_table_size_mb: parsed['doc_table_size_mb'],
        indexing_failures: parsed['hash_indexing_failures'],
      },
    };
  }

  /**
   * DELETE /ai/embeddings/:id
   *
   * LEARNING: Keeping your vector index in sync with the source DB is
   * one of the hardest parts of RAG in production. This endpoint
   * handles deletion — call it from your products DELETE handler.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteEmbedding(@Param('id') id: string) {
    await this.embeddingsService.deleteProductEmbedding(id);
    return {
      statusCode: HttpStatus.OK,
      message: `Embedding for product ${id} deleted`,
    };
  }
}
