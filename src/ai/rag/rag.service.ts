import { Injectable, Logger } from '@nestjs/common';
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { EmbeddingsService, VECTOR_SET_KEY } from '../embeddings/embeddings.service';
import { RedisService } from '../../redis/redis.service';

async function retryOnOverload<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  const delays = [5000, 10000];
  let lastErr: any;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const isTransient =
        err?.message?.includes('high demand') ||
        err?.message?.includes('UNAVAILABLE') ||
        (err?.lastError as any)?.statusCode === 503;
      if (!isTransient || attempt === maxAttempts - 1) throw err;
      const wait = delays[attempt] ?? 10000;
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

export interface SemanticSearchResult {
  product_id: string;
  name: string;
  price: string;
  category_name: string;
  subcategory_name: string;
  description?: string;
  image_url: string;
  similarity_score: number;
}

export interface RagAnswerResult {
  answer: string;
  sources: SemanticSearchResult[];
  model: string;
}

const SYNONYM_MAP: Record<string, string[]> = {
  shoe: ['shoe', 'shoes', 'sneaker', 'sneakers', 'footwear', 'kicks', 'boot', 'boots', 'runner', 'running', 'lifestyle'],
  shoes: ['shoe', 'shoes', 'sneaker', 'sneakers', 'footwear', 'kicks', 'boot', 'boots', 'runner', 'running', 'lifestyle'],
  sneaker: ['shoe', 'shoes', 'sneaker', 'sneakers', 'footwear', 'kicks', 'boot', 'boots', 'lifestyle'],
  sneakers: ['shoe', 'shoes', 'sneaker', 'sneakers', 'footwear', 'kicks', 'boot', 'boots', 'lifestyle'],
  laptop: ['laptop', 'laptops', 'notebook', 'macbook', 'ideapad', 'pavilion', 'inspiron', 'rog', 'computer'],
  laptops: ['laptop', 'laptops', 'notebook', 'macbook', 'ideapad', 'pavilion', 'inspiron', 'rog', 'computer'],
  tv: ['tv', 'tvs', 'television', 'qled', 'oled', 'bravia', 'smart tv', 'screen'],
  tvs: ['tv', 'tvs', 'television', 'qled', 'oled', 'bravia', 'smart tv', 'screen'],
  television: ['tv', 'tvs', 'television', 'qled', 'oled', 'bravia', 'smart tv', 'screen'],
  televisions: ['tv', 'tvs', 'television', 'qled', 'oled', 'bravia', 'smart tv', 'screen'],
  camera: ['camera', 'cameras', 'dslr', 'mirrorless', 'eos', 'alpha', 'lens', 'photography'],
  cameras: ['camera', 'cameras', 'dslr', 'mirrorless', 'eos', 'alpha', 'lens', 'photography'],
  phone: ['phone', 'phones', 'smartphone', 'smartphones', 'mobile', 'galaxy', 'pixel', 'oneplus', 'iphone'],
  phones: ['phone', 'phones', 'smartphone', 'smartphones', 'mobile', 'galaxy', 'pixel', 'oneplus', 'iphone'],
  smartphone: ['phone', 'phones', 'smartphone', 'smartphones', 'mobile', 'galaxy', 'pixel', 'oneplus', 'iphone'],
  smartphones: ['phone', 'phones', 'smartphone', 'smartphones', 'mobile', 'galaxy', 'pixel', 'oneplus', 'iphone'],
  chair: ['chair', 'chairs', 'ergonomic', 'seat', 'seating', 'office chair'],
  chairs: ['chair', 'chairs', 'ergonomic', 'seat', 'seating', 'office chair'],
  watch: ['watch', 'watches', 'smartwatch', 'apple watch', 'wearable'],
  watches: ['watch', 'watches', 'smartwatch', 'apple watch', 'wearable'],
  headphone: ['headphone', 'headphones', 'earbuds', 'airpods', 'audio', 'sound'],
  headphones: ['headphone', 'headphones', 'earbuds', 'airpods', 'audio', 'sound'],
};

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly embeddingsService: EmbeddingsService,
    private readonly redisService: RedisService,
  ) {}

  async semanticSearch(
    query: string,
    topK: number = 5,
    maxPrice?: number,
  ): Promise<SemanticSearchResult[]> {
    const queryEmbedding = await this.embeddingsService.generateEmbedding(query);
    const queryBuffer = this.embeddingsService.float32ArrayToBuffer(queryEmbedding);

    const fetchCount = Math.max(topK * 3, 15);

    try {
      const rawResults = await this.redisService.callCommand(
        'VSIM', VECTOR_SET_KEY,
        'FP32', queryBuffer,
        'WITHSCORES',
        'WITHATTRIBS',
        'COUNT', String(fetchCount),
      ) as any[];

      const parsed = this.parseVsimResults(rawResults);

      let candidatePool = maxPrice
        ? parsed.filter(p => parseFloat(p.price) <= maxPrice)
        : parsed;

      if (candidatePool.length === 0) return [];

      const stopWords = new Set(['a', 'an', 'the', 'for', 'in', 'on', 'with', 'and', 'or', 'of', 'is', 'to', 'me', 'find', 'show', 'get', 'buy', 'want', 'search', 'top', 'best', 'under', 'price', 'product', 'products', 'item', 'items']);
      const rawTerms = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(t => t.length > 1 && !stopWords.has(t));

      const expandedTerms = new Set<string>();
      rawTerms.forEach(term => {
        expandedTerms.add(term);
        const stemmed = term.endsWith('s') && term.length > 3 ? term.slice(0, -1) : term;
        expandedTerms.add(stemmed);
        if (SYNONYM_MAP[term]) SYNONYM_MAP[term].forEach(s => expandedTerms.add(s));
        if (SYNONYM_MAP[stemmed]) SYNONYM_MAP[stemmed].forEach(s => expandedTerms.add(s));
      });

      const termList = Array.from(expandedTerms);

      const scored = candidatePool.map(p => {
        const text = `${p.name} ${p.category_name} ${p.subcategory_name} ${p.description || ''}`.toLowerCase();
        let matchCount = 0;
        termList.forEach(term => {
          try {
            const regex = new RegExp(`\\b${term}\\b`, 'i');
            if (regex.test(text)) matchCount++;
          } catch {
            if (text.includes(term)) matchCount++;
          }
        });

        const boostedScore = p.similarity_score + (matchCount * 0.08);

        return {
          product: p,
          boostedScore,
          matchCount,
          rawScore: p.similarity_score,
        };
      });

      scored.sort((a, b) => b.boostedScore - a.boostedScore);

      const topMatch = scored[0];
      const maxMatchCount = Math.max(...scored.map(s => s.matchCount));
      const hasTermMatches = maxMatchCount > 0;

      const filtered = scored.filter(s => {
        if (hasTermMatches) {
          // Require at least maxMatchCount - 1 matches to exclude weak tangential mentions
          const minRequired = Math.max(1, maxMatchCount - 1);
          return s.matchCount >= minRequired;
        }
        return (topMatch.rawScore - s.rawScore) <= 0.015;
      });

      return filtered.slice(0, topK).map(s => s.product);
    } catch (err: any) {
      this.logger.error('Semantic search failed:', err?.message);
      return [];
    }
  }

  async ragAnswer(
    query: string,
    topK: number = 5,
    maxPrice?: number,
  ): Promise<RagAnswerResult> {
    const sources = await this.semanticSearch(query, topK, maxPrice);

    if (sources.length === 0) {
      return {
        answer: "I couldn't find any matching products in our catalog for your query. Try rephrasing or broadening your search.",
        sources: [],
        model: 'gemini-3.6-flash',
      };
    }

    const context = sources
      .map((p, idx) =>
        `[${idx + 1}] "${p.name}" — ₹${p.price}` +
        (p.category_name    ? ` | Category: ${p.category_name}`    : '') +
        (p.subcategory_name ? ` | Subcategory: ${p.subcategory_name}` : '') +
        ` | Relevance: ${(p.similarity_score * 100).toFixed(0)}%`,
      )
      .join('\n');

    try {
      const { text: answer } = await retryOnOverload(() => generateText({
        model: google('gemini-3.6-flash'),
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
      }));

      return {
        answer,
        sources,
        model: 'gemini-3.8-flash',
      };
    } catch (err: any) {
      const isTransient =
        err?.message?.includes('high demand') ||
        err?.message?.includes('UNAVAILABLE') ||
        (err?.lastError as any)?.statusCode === 503;

      this.logger.warn(`LLM generation failed after retries: ${err?.message}`);

      if (isTransient) {
        return {
          answer: 'The AI assistant is temporarily unavailable due to high demand. Your search results are below — please try again in a moment.',
          sources,
          model: 'gemini-3.8-flash',
        };
      }
      throw err;
    }
  }

  private parseVsimResults(raw: any[]): SemanticSearchResult[] {
    if (!Array.isArray(raw) || raw.length < 3) return [];

    const results: SemanticSearchResult[] = [];

    for (let i = 0; i < raw.length; i += 3) {
      const _elementId = raw[i];
      const score      = parseFloat(String(raw[i + 1] ?? '0'));
      const attribsRaw = raw[i + 2];

      let meta: Record<string, string> = {};
      if (attribsRaw) {
        try {
          meta = JSON.parse(String(attribsRaw));
        } catch {
          this.logger.warn(`Failed to parse attribs for element ${_elementId}`);
        }
      }

      results.push({
        product_id:       meta.product_id       ?? String(_elementId),
        name:             meta.name             ?? '',
        price:            meta.price            ?? '0',
        category_name:    meta.category_name    ?? '',
        subcategory_name: meta.subcategory_name ?? '',
        description:      meta.description      ?? '',
        image_url:        meta.image_url        ?? '',
        similarity_score: score,
      });
    }

    return results;
  }
}
