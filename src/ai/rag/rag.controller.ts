import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
  Optional,
  ParseFloatPipe,
} from '@nestjs/common';
import { RagService } from './rag.service';

export class RagQueryDto {
  query: string;
  topK?: number;
  maxPrice?: number;
}

/**
 * RagController — Phase 2 Learning Module
 *
 * Endpoints:
 *   GET  /ai/search?q=...&topK=5&maxPrice=2000   → Semantic search (retrieval only)
 *   POST /ai/rag                                  → Full RAG: search + LLM answer
 *
 * LEARNING — Two separate endpoints on purpose:
 *   /search  → Lets you inspect WHAT is being retrieved (debug retrieval quality)
 *   /rag     → The full pipeline (retrieval + generation)
 *
 *   This separation is a production best practice:
 *   If the LLM's answer is wrong, you can hit /search first to see
 *   if the RETRIEVAL is wrong (bad embeddings, wrong topK) or
 *   if the GENERATION is wrong (bad prompt, model issue).
 *
 * These endpoints are consumed by the Next.js chat API in Phase 3.
 */
@Controller('ai')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  /**
   * GET /ai/search?q=...&topK=5&maxPrice=2000
   *
   * LEARNING: The "Retrieval" half of RAG.
   * Use this to evaluate your search quality without burning LLM tokens.
   *
   * Questions to ask yourself:
   *   - Does "budget cookware" return affordable items?
   *   - Does "induction safe pan" return pans with induction support?
   *   - Are similarity scores above 0.7? (below 0.5 usually means poor match)
   */
  @Get('search')
  async semanticSearch(
    @Query('q') query: string,
    @Query('topK', new DefaultValuePipe(5), ParseIntPipe) topK: number,
    @Query('maxPrice', new DefaultValuePipe(0), ParseFloatPipe) maxPrice: number,
  ) {
    if (!query?.trim()) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Query parameter `q` is required',
        data: [],
      };
    }

    const results = await this.ragService.semanticSearch(
      query,
      topK,
      maxPrice > 0 ? maxPrice : undefined,
    );

    return {
      statusCode: HttpStatus.OK,
      message: `Found ${results.length} semantically similar products`,
      data: results,
    };
  }

  /**
   * POST /ai/rag
   * Body: { query: string, topK?: number, maxPrice?: number }
   *
   * LEARNING: The full RAG pipeline — retrieval + LLM generation.
   * The response includes `sources` (what was retrieved) and `answer` (LLM output).
   *
   * Always return sources alongside the answer in production.
   * This enables "citations" in the UI — users can verify the LLM's answer.
   */
  @Post('rag')
  async ragAnswer(@Body() body: RagQueryDto) {
    if (!body?.query?.trim()) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: '`query` field is required in the request body',
      };
    }

    const result = await this.ragService.ragAnswer(
      body.query,
      body.topK ?? 5,
      body.maxPrice,
    );

    return {
      statusCode: HttpStatus.OK,
      message: 'RAG answer generated',
      data: result,
    };
  }
}
