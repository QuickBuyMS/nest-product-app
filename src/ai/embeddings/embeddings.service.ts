import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { embed, embedMany } from 'ai';
import { google } from '@ai-sdk/google';
import { RedisService } from '../../redis/redis.service';
import { ProductRepository, ProductRow } from '../../products/product.repository';

export const EMBEDDING_MODEL = google.textEmbeddingModel('gemini-embedding-001');
export const EMBEDDING_DIM = 3072;
export const VECTOR_SET_KEY = 'products:vectors';
export const PRODUCT_META_PREFIX = 'product:meta:';

export const VECTOR_INDEX_NAME = VECTOR_SET_KEY;
export const PRODUCT_KEY_PREFIX = PRODUCT_META_PREFIX;

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

  async onModuleInit() {
    await this.ensureVectorSupport();
  }

  async ensureVectorSupport(): Promise<void> {
    try {
      const modules = await this.redisService.callCommand('MODULE', 'LIST') as any[];
      const hasVectorset = modules?.some?.((m: any) => {
        if (Array.isArray(m)) {
          return m.includes('vectorset');
        }
        return false;
      });
      if (hasVectorset || modules) {
        this.logger.log('Redis 8 VECTORSET module detected — ready for native vector search');
      }
    } catch (err: any) {
      this.logger.warn('Could not verify VECTORSET module:', err?.message);
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const { embedding } = await embed({
      model: EMBEDDING_MODEL,
      value: text,
    });
    return embedding;
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const { embeddings } = await embedMany({
      model: EMBEDDING_MODEL,
      values: texts,
    });
    return embeddings;
  }

  async indexAllProducts(): Promise<{ indexed: number; errors: number; total: number }> {
    const BATCH_SIZE = 5;

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
      const texts = batch.map(p => this.buildProductText(p));

      try {
        const embeddings = await this.generateEmbeddings(texts);

        for (let j = 0; j < batch.length; j++) {
          const product = batch[j] as any;
          const embedding = embeddings[j];
          const elementId = String(product.product_id);

          const vectorArgs: (string | number)[] = [
            VECTOR_SET_KEY, 'VALUES', String(EMBEDDING_DIM),
            ...embedding.map(v => String(v)),
            elementId,
          ];
          await this.redisService.callCommand('VADD', ...vectorArgs);

          const meta = {
            product_id:       elementId,
            name:             product.name ?? '',
            price:            String(product.price ?? 0),
            category_name:    (product as any).category_name ?? '',
            subcategory_name: (product as any).subcategory_name ?? '',
            description:      (product as any).description ?? '',
            image_url:        (product as any).image_url ?? '',
          };
          await this.redisService.callCommand(
            'VSETATTR', VECTOR_SET_KEY, elementId, JSON.stringify(meta),
          );

          indexed++;
        }

        this.logger.log(`Indexed batch ${i + 1}–${Math.min(i + BATCH_SIZE, total)} / ${total}`);

        if (i + BATCH_SIZE < total) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (err: any) {
        this.logger.error(`Batch ${i}–${i + BATCH_SIZE} failed: ${err?.message}`);
        errors += batch.length;
      }
    }

    this.logger.log(`Indexing complete — ${indexed} indexed, ${errors} errors`);
    return { indexed, errors, total };
  }

  async deleteProductEmbedding(productId: string): Promise<void> {
    try {
      await this.redisService.callCommand('VDEL', VECTOR_SET_KEY, productId);
      this.logger.log(`Deleted vector for product ${productId}`);
    } catch (err: any) {
      this.logger.warn(`Could not delete vector for product ${productId}: ${err?.message}`);
    }
  }

  buildProductText(product: any): string {
    const parts = [
      product.name,
      product.description,
      product.category_name    ? `Category: ${product.category_name}` : null,
      product.subcategory_name ? `Subcategory: ${product.subcategory_name}` : null,
      product.price            ? `Price: ₹${product.price}` : null,
    ].filter(Boolean);
    return parts.join('. ');
  }

  float32ArrayToBuffer(embedding: number[]): Buffer {
    const buffer = Buffer.allocUnsafe(embedding.length * 4);
    for (let i = 0; i < embedding.length; i++) {
      buffer.writeFloatLE(embedding[i], i * 4);
    }
    return buffer;
  }
}
