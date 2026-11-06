import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { ReviewRepository } from './review.repository';
import { RedisService } from '../../redis/redis.service';

// ─── The Zod Schema — the HEART of Phase 6 ───────────────────────────────────
//
// LEARNING: `generateObject` forces the LLM to return data that matches this
// schema EXACTLY. No parsing, no regex, no "hope it's valid JSON".
//
// Vercel AI SDK uses this schema to:
//   1. Tell the model the exact shape it must produce (via JSON Schema in the prompt)
//   2. Validate and parse the output automatically
//   3. Give you a fully typed TypeScript object back
//
// This is the modern way to get structured data from LLMs.
// See: https://sdk.vercel.ai/docs/ai-sdk-core/generating-structured-data
//
// ╔══════════════════ GOLD STANDARD ALTERNATIVE ═══════════════════════════════╗
// ║  For more complex nested schemas, consider:                                ║
// ║  → `streamObject` for streaming large structured outputs                  ║
// ║  → Anthropic's tool_use / OpenAI's function_calling (same concept)       ║
// ║  → Adding `.describe()` to each Zod field for richer prompt context      ║
// ╚════════════════════════════════════════════════════════════════════════════╝

export const ReviewSummarySchema = z.object({
  sentimentScore: z
    .number()
    .min(0)
    .max(10)
    .describe('Overall sentiment score from 0 (very negative) to 10 (very positive)'),

  averageRating: z
    .number()
    .min(1)
    .max(5)
    .describe('Average star rating across all reviews, rounded to 1 decimal'),

  pros: z
    .array(z.string())
    .min(1)
    .max(5)
    .describe('Up to 5 key positive points mentioned by reviewers'),

  cons: z
    .array(z.string())
    .max(5)
    .describe('Up to 5 key negative points or complaints from reviewers. Empty array if none.'),

  verdict: z
    .string()
    .describe('A single punchy sentence summarizing what kind of buyer this product suits'),

  totalReviewed: z
    .number()
    .describe('Total number of reviews that were analyzed'),

  ratingBreakdown: z.object({
    five:  z.number().describe('Count of 5-star reviews'),
    four:  z.number().describe('Count of 4-star reviews'),
    three: z.number().describe('Count of 3-star reviews'),
    two:   z.number().describe('Count of 2-star reviews'),
    one:   z.number().describe('Count of 1-star reviews'),
  }).describe('Distribution of star ratings across all reviews'),
});

// LEARNING: Derive the TypeScript type directly from the Zod schema.
// You define the schema ONCE and TypeScript infers the type automatically.
// This eliminates drift between your schema and your types.
export type ReviewSummary = z.infer<typeof ReviewSummarySchema>;

// Cache review summaries for 1 hour — reviews don't change every second
// and AI calls are expensive. This is critical for production.
const SUMMARY_CACHE_TTL = 60 * 60; // 1 hour
const SUMMARY_CACHE_PREFIX = 'ai:review-summary:';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly reviewRepo: ReviewRepository,
    private readonly redisService: RedisService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Core: Summarize all reviews for a product using Gemini + structured output
  //
  // LEARNING — Full pipeline:
  //   1. Check Redis cache first (avoid redundant AI calls)
  //   2. Fetch raw reviews from MySQL
  //   3. Calculate rating distribution directly from DB data (deterministic)
  //   4. Build a compact text representation (minimize token usage)
  //   5. Call generateObject() → Gemini returns a schema-validated object
  //   6. Cache the result in Redis
  //   7. Return the typed ReviewSummary
  // ──────────────────────────────────────────────────────────────────────────
  async summarizeReviews(productId: string): Promise<ReviewSummary> {
    // Step 1: Cache check
    const cacheKey = `${SUMMARY_CACHE_PREFIX}${productId}`;
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        this.logger.debug(`Cache HIT for review summary: product ${productId}`);
        return JSON.parse(cached) as ReviewSummary;
      }
    } catch (cacheErr: any) {
      // Non-fatal — fall through to AI generation
      this.logger.warn(`Cache GET failed: ${cacheErr?.message}`);
    }

    // Step 2: Fetch reviews from DB
    const reviews = await this.reviewRepo.getByProductId(productId);

    if (reviews.length === 0) {
      throw new NotFoundException(
        `No reviews found for product ${productId}. Add some reviews first.`,
      );
    }

    // Step 3: Calculate rating breakdown deterministically (don't trust the LLM for counting)
    // LEARNING: Only ask the LLM for things it's GOOD at (language understanding).
    //           For arithmetic/counting, compute it yourself — LLMs can miscalculate.
    const ratingBreakdown = {
      five:  reviews.filter(r => r.rating === 5).length,
      four:  reviews.filter(r => r.rating === 4).length,
      three: reviews.filter(r => r.rating === 3).length,
      two:   reviews.filter(r => r.rating === 2).length,
      one:   reviews.filter(r => r.rating === 1).length,
    };

    const avgRating =
      reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

    // Step 4: Build compact review text for the prompt
    // LEARNING: Prompt economy matters. Each token costs money and adds latency.
    // Format reviews densely: "[★5] Title: body text" instead of verbose JSON.
    const reviewText = reviews
      .map(r =>
        `[★${r.rating}]${r.title ? ` ${r.title}:` : ''} ${r.body.slice(0, 300)}`,
      )
      .join('\n');

    // Step 5: Call generateObject — THE KEY LEARNING OF PHASE 6
    //
    // Compare with generateText (Phase 2):
    //   generateText  → returns a raw string, you parse it manually
    //   generateObject → returns a typed, validated object matching your Zod schema
    //
    // The SDK automatically:
    //   1. Converts your Zod schema to JSON Schema
    //   2. Includes it in the model's system prompt
    //   3. Validates the model's output against the schema
    //   4. Retries if the model produces invalid JSON (up to 3 attempts)
    this.logger.log(
      `Summarizing ${reviews.length} reviews for product ${productId} via Gemini...`,
    );

    const { object: aiSummary } = await generateObject({
      model: google('gemini-3.6-flash'),
      schema: ReviewSummarySchema,
      system: `You are an expert review analyst for QuickBuy, an Indian e-commerce platform.
Your job is to distill customer reviews into clear, honest, and actionable summaries.

RULES:
1. Base your analysis ONLY on the reviews provided. Do not invent or assume.
2. The sentimentScore should reflect the overall tone: very positive reviews = 8-10, mixed = 4-7, mostly negative = 0-3.
3. Pros and cons must be SPECIFIC points extracted from actual review text — not generic phrases.
4. The verdict must be one punchy, useful sentence (e.g. "Great for budget buyers who don't need premium build quality.").
5. Do NOT include the ratingBreakdown or totalReviewed fields — those will be provided separately.
6. Keep pros/cons concise — max 10 words each.`,

      prompt: `Analyze these ${reviews.length} customer reviews for a product on QuickBuy:

${reviewText}

Return a structured summary following the schema exactly.`,
    });

    // Step 6: Override the counting fields with our pre-computed values
    // LEARNING: Merge AI-generated prose fields with deterministic calculated fields.
    //           This is the "trust but verify" pattern for LLM outputs.
    const finalSummary: ReviewSummary = {
      ...aiSummary,
      totalReviewed: reviews.length,
      averageRating: Math.round(avgRating * 10) / 10, // Round to 1 decimal
      ratingBreakdown,
    };

    // Step 7: Cache the final result
    try {
      await this.redisService.set(
        cacheKey,
        JSON.stringify(finalSummary),
        SUMMARY_CACHE_TTL,
      );
      this.logger.debug(`Cached review summary for product ${productId} (TTL: 1h)`);
    } catch (cacheErr: any) {
      this.logger.warn(`Cache SET failed: ${cacheErr?.message}`);
    }

    return finalSummary;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Invalidate the cached summary (call this whenever a new review is added)
  // LEARNING: Cache invalidation strategy — invalidate on write, not on a timer.
  //           This ensures the summary is always accurate after a new review.
  // ──────────────────────────────────────────────────────────────────────────
  async invalidateSummaryCache(productId: string): Promise<void> {
    const cacheKey = `${SUMMARY_CACHE_PREFIX}${productId}`;
    try {
      await this.redisService.delete(cacheKey);
      this.logger.log(`Invalidated review summary cache for product ${productId}`);
    } catch (err: any) {
      this.logger.warn(`Cache invalidation failed: ${err?.message}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Submit a new review — also invalidates the AI summary cache
  // ──────────────────────────────────────────────────────────────────────────
  async submitReview(
    productId: string,
    userId: string,
    rating: number,
    body: string,
    title?: string,
  ): Promise<{ reviewId: number; message: string }> {
    const reviewId = await this.reviewRepo.create(
      productId,
      userId,
      rating,
      body,
      title,
    );

    // Invalidate the AI summary so the next request regenerates it
    await this.invalidateSummaryCache(productId);

    return {
      reviewId,
      message: 'Review submitted successfully. AI summary will be regenerated.',
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Get raw reviews (without AI summarization) — useful for the review list UI
  // ──────────────────────────────────────────────────────────────────────────
  async getRawReviews(productId: string) {
    return this.reviewRepo.getByProductId(productId);
  }
}
