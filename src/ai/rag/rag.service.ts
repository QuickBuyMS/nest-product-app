import { Injectable, Logger } from '@nestjs/common';
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { EmbeddingsService, VECTOR_INDEX_NAME } from '../embeddings/embeddings.service';
import { RedisService } from '../../redis/redis.service';

// ─── LLM Model Configuration ──────────────────────────────────────────────────
//
// FREE (current):  gemini-1.5-flash
//   → 15 RPM, 1M TPM on free tier
//   → Fast, good at instruction following, great for Q&A
//
// ╔══════════════════ GOLD STANDARD ALTERNATIVES ══════════════════════════════╗
// ║  gemini-1.5-pro (~$1.25/1M input tokens, $5/1M output tokens)             ║
// ║  → 2M context window — can handle massive product catalogs in one shot    ║
// ║                                                                            ║
// ║  Claude 3.5 Sonnet via @ai-sdk/anthropic (~$3/1M input tokens)            ║
// ║  → Best in class for following nuanced instructions                        ║
// ║  → Ideal for complex comparison/recommendation tasks                      ║
// ║                                                                            ║
// ║  GPT-4o via @ai-sdk/openai (~$2.5/1M input tokens)                        ║
// ║  → Best tool-calling reliability in agentic pipelines                     ║
// ╚════════════════════════════════════════════════════════════════════════════╝

export interface SemanticSearchResult {
  product_id: string;
  name: string;
  price: string;
  category_name: string;
  subcategory_name: string;
  image_url: string;
  similarity_score: number; // 0.0 (dissimilar) → 1.0 (identical)
}

export interface RagAnswerResult {
  answer: string;
  sources: SemanticSearchResult[];
  model: string;
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly embeddingsService: EmbeddingsService,
    private readonly redisService: RedisService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // PHASE 2, CORE CONCEPT: Semantic Search via Vector Similarity
  //
  // LEARNING:
  //   1. The user's query text gets converted to a vector (same model as products)
  //   2. Redis Stack's KNN search finds the K closest product vectors in O(log N)
  //   3. "Closest" = smallest cosine distance = most semantically similar
  //
  //   Example:
  //     Query: "non-stick cookware for induction"
  //     → Embedding: [0.12, -0.43, 0.87, ...] (768 numbers)
  //     → Redis finds products whose description vectors are closest to this
  //     → Returns "Prestige Non-Stick Pan" before "Cast Iron Skillet"
  //
  // WHY NOT KEYWORD SEARCH?
  //   "induction cookware" would miss products described as
  //   "magnetic-base frying pan" — semantic search understands meaning, not words.
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Perform semantic (vector) similarity search against the Redis Stack index.
   *
   * @param query    Natural language query from the user
   * @param topK     Number of results to return (default 5)
   * @param maxPrice Optional price filter (hybrid search: filter + vector)
   *
   * ╔══════════════════ GOLD STANDARD ALTERNATIVE ═══════════════════════════╗
   * ║  Hybrid Search: combine vector similarity + BM25 keyword relevance    ║
   * ║  (RRF — Reciprocal Rank Fusion to merge both result sets)             ║
   * ║  → Redis Stack 7.2+ supports this natively with `HYBRID_POLICY`       ║
   * ║  → Qdrant and Pinecone also support hybrid natively                   ║
   * ║  → Typically 10-15% better retrieval accuracy than pure vector search ║
   * ╚════════════════════════════════════════════════════════════════════════╝
   */
  async semanticSearch(
    query: string,
    topK: number = 5,
    maxPrice?: number,
  ): Promise<SemanticSearchResult[]> {
    // Step 1: Embed the query (same model that embedded the products)
    const queryEmbedding = await this.embeddingsService.generateEmbedding(query);
    const queryBuffer = this.embeddingsService.float32ArrayToBuffer(queryEmbedding);

    // Step 2: Build the FT.SEARCH query
    // KNN = K-Nearest Neighbors, finds the `topK` closest vectors
    // `@price:[0 ${maxPrice}]` is a pre-filter — reduces search space before ANN
    const preFilter = maxPrice ? `@price:[0 ${maxPrice}] ` : '';
    const searchQuery = `${preFilter}=>[KNN ${topK} @embedding $query_vec AS vector_score]`;

    try {
      const rawResults = await this.redisService.callCommand(
        'FT.SEARCH',
        VECTOR_INDEX_NAME,
        searchQuery,
        'PARAMS', '2',
        'query_vec',  queryBuffer,
        'RETURN',     '7',
          'product_id', 'name', 'price',
          'category_name', 'subcategory_name',
          'image_url', 'vector_score',
        'SORTBY', 'vector_score', // Lower score = more similar (cosine distance)
        'LIMIT',  '0', String(topK),
        'DIALECT', '2',  // Required for KNN syntax
      );

      return this.parseSearchResults(rawResults as any[]);
    } catch (err: any) {
      this.logger.error('Semantic search failed:', err?.message);
      // Graceful fallback: return empty results so the caller can fall back to SQL
      return [];
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PHASE 2, CORE CONCEPT: The full RAG pipeline
  //
  // LEARNING — The 3 steps of RAG:
  //   R → Retrieve: semanticSearch() finds relevant products from Redis
  //   A → Augment:  those products are injected into the LLM prompt as context
  //   G → Generate: the LLM answers the query ONLY from that context
  //
  // Key Design Decision — "Grounding":
  //   The system prompt explicitly tells the LLM:
  //   "Do NOT answer from general knowledge. Use ONLY the products below."
  //   This is what prevents hallucination in RAG systems.
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Full RAG pipeline: retrieve relevant products, then generate a grounded answer.
   *
   * @param query     User's natural language question
   * @param topK      How many products to retrieve as context
   * @param maxPrice  Optional price constraint for hybrid retrieval
   *
   * ╔══════════════════ GOLD STANDARD ALTERNATIVE ═══════════════════════════╗
   * ║  Reranking (Cross-Encoder models):                                     ║
   * ║  After retrieval, pass all topK results through a reranker model       ║
   * ║  (e.g. Cohere Rerank, BGE-Reranker) before injecting into the prompt. ║
   * ║  The reranker is a dedicated model that scores (query, document) pairs ║
   * ║  with much higher precision than embedding cosine similarity alone.    ║
   * ║  → Typically 15-30% improvement in answer quality                      ║
   * ║  → Cohere Rerank: ~$1/1000 search units                               ║
   * ╚════════════════════════════════════════════════════════════════════════╝
   */
  async ragAnswer(
    query: string,
    topK: number = 5,
    maxPrice?: number,
  ): Promise<RagAnswerResult> {
    // Step R — Retrieve
    const sources = await this.semanticSearch(query, topK, maxPrice);

    if (sources.length === 0) {
      return {
        answer: "I couldn't find any matching products in our catalog for your query. Try rephrasing or broadening your search.",
        sources: [],
        model: 'gemini-1.5-flash',
      };
    }

    // Step A — Augment: build a structured context string
    // LEARNING: How you format context dramatically affects answer quality.
    // Include the most decision-relevant fields (name, price, category).
    const context = sources
      .map((p, idx) =>
        `[${idx + 1}] "${p.name}" — ₹${p.price}` +
        (p.category_name    ? ` | Category: ${p.category_name}`    : '') +
        (p.subcategory_name ? ` | Subcategory: ${p.subcategory_name}` : '') +
        ` | Relevance: ${(p.similarity_score * 100).toFixed(0)}%`,
      )
      .join('\n');

    // Step G — Generate: the LLM synthesizes an answer from the context
    const { text: answer } = await generateText({
      model: google('gemini-1.5-flash'), // Free tier: 15 RPM
      system: `You are a knowledgeable and helpful e-commerce shopping assistant for QuickBuy.

RULES (follow strictly):
1. Answer ONLY from the product list provided below. Do NOT use general knowledge.
2. If the user's query cannot be answered from the list, say "I don't have matching products for that right now."
3. Be concise, warm, and helpful. Format prices in Indian Rupees (₹).
4. If recommending, explain briefly WHY it matches the user's need.
5. Do NOT mention similarity scores or internal details to the user.`,

      prompt: `User's question: "${query}"

Available products (retrieved from our catalog):
${context}

Please answer the user's question based only on the products above.`,
    });

    return {
      answer,
      sources,
      model: 'gemini-1.5-flash',
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Parse the flat array returned by FT.SEARCH into typed objects.
   *
   * FT.SEARCH returns: [total_count, key1, [field1, val1, field2, val2, ...], key2, ...]
   * LEARNING: Redis returns data as flat arrays — always need to reshape them.
   */
  private parseSearchResults(raw: any[]): SemanticSearchResult[] {
    if (!Array.isArray(raw) || raw.length < 1) return [];

    const results: SemanticSearchResult[] = [];

    // raw[0] = total count, then alternating: redis_key, field_array, redis_key, field_array...
    for (let i = 1; i < raw.length; i += 2) {
      const fields = raw[i + 1] as string[];
      if (!Array.isArray(fields)) continue;

      const obj: Record<string, string> = {};
      for (let j = 0; j < fields.length - 1; j += 2) {
        obj[fields[j]] = fields[j + 1];
      }

      // COSINE DISTANCE: 0.0 = identical, 2.0 = opposite
      // Convert to a 0-1 SIMILARITY score (1 = perfect match)
      const cosineDistance = parseFloat(obj.vector_score ?? '1');
      const similarityScore = Math.max(0, 1 - cosineDistance);

      results.push({
        product_id:       obj.product_id ?? '',
        name:             obj.name ?? '',
        price:            obj.price ?? '0',
        category_name:    obj.category_name ?? '',
        subcategory_name: obj.subcategory_name ?? '',
        image_url:        obj.image_url ?? '',
        similarity_score: similarityScore,
      });
    }

    return results;
  }
}
