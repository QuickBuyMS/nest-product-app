import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  ParseIntPipe,
} from '@nestjs/common';
import { IsString, IsInt, IsOptional, Min, Max, IsNotEmpty, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ReviewsService } from './reviews.service';

// ─── DTOs (Data Transfer Objects) ────────────────────────────────────────────
//
// LEARNING: DTOs + class-validator give you automatic input validation.
// If the request body doesn't match, NestJS returns a 400 before your
// service code even runs. Much safer than validating manually.

export class SubmitReviewDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsInt()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  rating: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;
}

/**
 * ReviewsController — Phase 6 Learning Module
 *
 * Endpoints:
 *   GET    /ai/reviews/:productId/summary   → AI-generated structured summary
 *   GET    /ai/reviews/:productId           → Raw reviews list (no AI)
 *   POST   /ai/reviews/:productId           → Submit a new review
 *   DELETE /ai/reviews/:productId/cache     → Manually invalidate AI summary cache
 *
 * ─── What Phase 6 teaches ─────────────────────────────────────────────────
 *
 * BEFORE (Phase 2 — generateText):
 *   const { text } = await generateText({ ... });
 *   // `text` is a raw string — you hope it's valid JSON, then parse it
 *   const parsed = JSON.parse(text); // 💥 can throw, shape is unvalidated
 *
 * AFTER (Phase 6 — generateObject):
 *   const { object } = await generateObject({ schema: ReviewSummarySchema, ... });
 *   // `object` is fully typed ReviewSummary — validated, parsed, type-safe ✅
 *   object.sentimentScore; // TypeScript KNOWS this is a number
 *
 * The SDK handles:
 *   → Converting Zod schema to JSON Schema for the model's prompt
 *   → Parsing the model's output
 *   → Retrying if the model produces invalid JSON (up to 3x)
 *   → Throwing a typed error if all retries fail
 *
 * ╔══════════════════ GOLD STANDARD ALTERNATIVE ═══════════════════════════════╗
 * ║  For production review summarization at scale:                             ║
 * ║  → Trigger summarization via BullMQ job on new review (async, not on GET) ║
 * ║  → Store the final summary in MySQL (not just Redis) for durability        ║
 * ║  → Add a `summary_updated_at` column to know when it was last generated   ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
 */
@Controller('ai/reviews')
export class ReviewsController {
  private readonly logger = new Logger(ReviewsController.name);

  constructor(private readonly reviewsService: ReviewsService) {}

  /**
   * GET /ai/reviews/:productId/summary
   *
   * LEARNING: This is the main endpoint for Phase 6.
   * It demonstrates the full generateObject pipeline:
   *   1. Tries Redis cache first (fast path)
   *   2. On miss: fetches reviews from MySQL
   *   3. Calls Gemini with a Zod schema → gets back a typed ReviewSummary
   *   4. Caches result for 1 hour
   *   5. Returns the structured JSON to the frontend
   *
   * The response shape is GUARANTEED by the Zod schema — no runtime surprises.
   */
  @Get(':productId/summary')
  async getReviewSummary(@Param('productId') productId: string) {
    this.logger.log(`AI summary requested for product ${productId}`);

    const summary = await this.reviewsService.summarizeReviews(productId);

    return {
      statusCode: HttpStatus.OK,
      message: 'AI review summary generated',
      data: summary,
    };
  }

  /**
   * GET /ai/reviews/:productId
   *
   * LEARNING: Separate endpoint for raw reviews list.
   * Always expose raw data alongside AI summaries so the frontend can
   * render both the summary AND the individual review cards.
   */
  @Get(':productId')
  async getReviews(@Param('productId') productId: string) {
    const reviews = await this.reviewsService.getRawReviews(productId);

    return {
      statusCode: HttpStatus.OK,
      message: `Found ${reviews.length} reviews`,
      data: reviews,
    };
  }

  /**
   * POST /ai/reviews/:productId
   * Body: { userId, rating, body, title? }
   *
   * LEARNING: After submitting a review, we invalidate the AI summary cache.
   * This is the "write-through cache invalidation" pattern:
   *   Write (new review) → invalidate stale cache → next GET regenerates fresh summary
   *
   * The alternative (TTL-only) would mean users see stale summaries for up to 1 hour.
   */
  @Post(':productId')
  @HttpCode(HttpStatus.CREATED)
  async submitReview(
    @Param('productId') productId: string,
    @Body() body: SubmitReviewDto,
  ) {
    const result = await this.reviewsService.submitReview(
      productId,
      body.userId,
      body.rating,
      body.body,
      body.title,
    );

    return {
      statusCode: HttpStatus.CREATED,
      message: result.message,
      data: { reviewId: result.reviewId },
    };
  }

  /**
   * DELETE /ai/reviews/:productId/cache
   *
   * LEARNING: Manual cache invalidation endpoint.
   * Useful for admin dashboards — if a reviewer edits or deletes a review,
   * you can force-regenerate the AI summary without waiting for TTL expiry.
   */
  @Delete(':productId/cache')
  @HttpCode(HttpStatus.OK)
  async invalidateCache(@Param('productId') productId: string) {
    await this.reviewsService.invalidateSummaryCache(productId);

    return {
      statusCode: HttpStatus.OK,
      message: `AI summary cache cleared for product ${productId}. Next GET will regenerate it.`,
    };
  }
}
