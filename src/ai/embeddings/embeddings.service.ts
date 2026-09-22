import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { embed, embedMany } from 'ai';
import { google } from '@ai-sdk/google';
import { RedisService } from '../../redis/redis.service';
import { ProductRepository, ProductRow } from '../../products/product.repository';

// ─── Embedding Model Configuration ───────────────────────────────────────────
//
// FREE (current):  Google text-embedding-004
//   → 768 dimensions, 1500 req/min on free tier
//   → https://ai.google.dev/models/text-embedding
//
// ╔══════════════════ GOLD STANDARD ALTERNATIVES ══════════════════════════════╗
// ║  OpenAI text-embedding-3-large (~$0.13/1M tokens)                         ║
// ║  → 3072 dimensions, state-of-the-art MTEB benchmark score                 ║
// ║  → Replace model with: openai.embedding('text-embedding-3-large')          ║
// ║                                                                            ║
// ║  Cohere embed-v4 (~$0.10/1M tokens)                                       ║
// ║  → Multimodal embeddings (text + image in same space)                     ║
// ║  → Great for product images + descriptions combined                       ║
// ╚════════════════════════════════════════════════════════════════════════════╝

export const EMBEDDING_MODEL = google.textEmbeddingModel('text-embedding-004');
export const EMBEDDING_DIM = 768; // Must match the model's output dimension
export const VECTOR_INDEX_NAME = 'idx:products_v1';
export const PRODUCT_KEY_PREFIX = 'product:emb:';

export interface IndexedProduct {
  product_id: string;
  name: string;
  price: string;
  description: string;
  category_name: string;
  subcategory_name: string;
  image_url?: string;
}

@Injectable()
export class EmbeddingsService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingsService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly productRepo: ProductRepository,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Lifecycle: Create the Redis Stack vector index on startup (idempotent)
  // ──────────────────────────────────────────────────────────────────────────
  async onModuleInit() {
    await this.ensureVectorIndex();
  }

  /**
   * Create the Redis Stack Full-Text + Vector index (idempotent).
   *
   * The index is on HASH keys prefixed with `product:emb:`.
   * HNSW algorithm for Approximate Nearest Neighbor (ANN) search.
   *
   * ╔══════════════════ GOLD STANDARD ALTERNATIVE ═══════════════════════════╗
   * ║  Pinecone (https://pinecone.io) — managed vector DB                   ║
   * ║  → Serverless tier: free up to 2GB storage, 2M vectors                ║
   * ║  → No manual index management, auto-scales, cloud-native              ║
   * ║  → Ideal for > 1M products or multi-tenant SaaS products              ║
   * ║                                                                        ║
   * ║  Qdrant (https://qdrant.tech) — open-source, self-hosted              ║
   * ║  → Superior filtering (payload-based) during vector search            ║
   * ║  → Docker: docker run -p 6333:6333 qdrant/qdrant                     ║
   * ║  → Managed cloud from $25/mo                                          ║
   * ╚════════════════════════════════════════════════════════════════════════╝
   */
  async ensureVectorIndex(): Promise<void> {
    try {
      await this.redisService.callCommand(
        'FT.CREATE', VECTOR_INDEX_NAME,
        'ON', 'HASH',
        'PREFIX', '1', PRODUCT_KEY_PREFIX,
        'SCHEMA',
        // Structured fields for hybrid search (filter + vector)
        'product_id',      'TAG',   'SORTABLE',
        'name',            'TEXT',  'WEIGHT', '3',
        'category_name',   'TEXT',  'WEIGHT', '1.5',
        'subcategory_name','TEXT',  'WEIGHT', '1',
        'price',           'NUMERIC', 'SORTABLE',
        // Vector field — HNSW for fast ANN
        'embedding',       'VECTOR', 'HNSW', '8',
          'TYPE',            'FLOAT32',
          'DIM',             String(EMBEDDING_DIM),
          'DISTANCE_METRIC', 'COSINE',
          'M',               '16',    // HNSW connectivity (higher = more accurate, slower build)
          'EF_CONSTRUCTION', '200',   // Build-time search width (higher = better quality index)
      );
      this.logger.log(`Vector index "${VECTOR_INDEX_NAME}" created successfully`);
    } catch (err: any) {
      if (err?.message?.includes('Index already exists')) {
        this.logger.debug(`Vector index "${VECTOR_INDEX_NAME}" already exists — skipping`);
      } else {
        // Log but don't crash — app can still run without vector search
        this.logger.error('Failed to create vector index:', err?.message);
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Core: Generate a single embedding vector from text
  // ──────────────────────────────────────────────────────────────────────────
  async generateEmbedding(text: string): Promise<number[]> {
    const { embedding } = await embed({
      model: EMBEDDING_MODEL,
      value: text,
    });
    return embedding;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Core: Batch-generate embeddings (more efficient, fewer API calls)
  // ──────────────────────────────────────────────────────────────────────────
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const { embeddings } = await embedMany({
      model: EMBEDDING_MODEL,
      values: texts,
    });
    return embeddings;
  }

  /**
   * Index ALL products from MySQL into Redis Stack.
   *
   * Strategy:
   *  1. Fetch all products from DB
   *  2. Build a rich text representation for each product
   *  3. Batch-embed in groups of 20 (stays within free-tier rate limits)
   *  4. Store each product's vector + metadata in Redis as a HASH
   *
   * ╔══════════════════ GOLD STANDARD ALTERNATIVE ═══════════════════════════╗
   * ║  For large catalogs (>100k products), use a queue-based approach:     ║
   * ║  → BullMQ (Redis-backed job queue, already in your Redis)             ║
   * ║  → Chunk products into batches, process as background jobs            ║
   * ║  → Add retry logic, dead-letter queues for failed embeddings          ║
   * ║  → Stream progress via Server-Sent Events (SSE) or WebSockets        ║
   * ╚════════════════════════════════════════════════════════════════════════╝
   */
  async indexAllProducts(): Promise<{ indexed: number; errors: number; total: number }> {
    const BATCH_SIZE = 20; // Free tier: 1500 req/min — 20/batch is safe

    // getAllProducts returns all rows — for a real catalog, paginate this
    const rawProducts = await this.productRepo.getAllProducts() as unknown as ProductRow[];
    const total = rawProducts?.length ?? 0;

    if (total === 0) {
      this.logger.warn('No products found in DB to index');
      return { indexed: 0, errors: 0, total: 0 };
    }

    let indexed = 0;
    let errors = 0;

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = rawProducts.slice(i, i + BATCH_SIZE);

      // Build a rich textual representation for each product
      // The richer the text, the better the semantic search quality
      const texts = batch.map(p => this.buildProductText(p));

      try {
        const embeddings = await this.generateEmbeddings(texts);

        // Store each product + its embedding as a Redis HASH
        for (let j = 0; j < batch.length; j++) {
          const product = batch[j] as any;
          const embedding = embeddings[j];
          const embeddingBuffer = this.float32ArrayToBuffer(embedding);

          await this.redisService.callCommand(
            'HSET',
            `${PRODUCT_KEY_PREFIX}${product.product_id}`,
            'product_id',       String(product.product_id),
            'name',             product.name ?? '',
            'description',      product.description ?? '',
            'price',            String(product.price ?? 0),
            'category_name',    (product as any).category_name ?? '',
            'subcategory_name', (product as any).subcategory_name ?? '',
            'image_url',        (product as any).image_url ?? '',
            'embedding',        embeddingBuffer,
          );
          indexed++;
        }

        this.logger.log(`Indexed batch ${i + 1}–${Math.min(i + BATCH_SIZE, total)} / ${total}`);
      } catch (err: any) {
        this.logger.error(`Batch ${i}–${i + BATCH_SIZE} failed: ${err?.message}`);
        errors += batch.length;
      }
    }

    this.logger.log(`Indexing complete — ${indexed} indexed, ${errors} errors`);
    return { indexed, errors, total };
  }

  /**
   * Delete a single product's embedding from the index.
   * Call this when a product is deleted/updated in MySQL.
   */
  async deleteProductEmbedding(productId: string): Promise<void> {
    await this.redisService.delete(`${PRODUCT_KEY_PREFIX}${productId}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Build the text that gets embedded for a product.
   * More context → better search quality.
   *
   * TIP: Include synonyms, attributes, use-cases if available.
   */
  buildProductText(product: any): string {
    const parts = [
      product.name,
      product.description,
      product.category_name   ? `Category: ${product.category_name}` : null,
      product.subcategory_name? `Subcategory: ${product.subcategory_name}` : null,
      product.price           ? `Price: ₹${product.price}` : null,
    ].filter(Boolean);
    return parts.join('. ');
  }

  /**
   * Convert a float32 JS number array into a binary Buffer.
   * Redis Stack's VECTOR field expects IEEE 754 float32 little-endian binary.
   */
  float32ArrayToBuffer(embedding: number[]): Buffer {
    const buffer = Buffer.allocUnsafe(embedding.length * 4);
    for (let i = 0; i < embedding.length; i++) {
      buffer.writeFloatLE(embedding[i], i * 4);
    }
    return buffer;
  }
}
