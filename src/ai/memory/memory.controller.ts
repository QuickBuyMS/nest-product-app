import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpStatus,
} from '@nestjs/common';
import { MemoryService, UserPreferences } from './memory.service';

/**
 * MemoryController — Phase 4 Learning Module
 *
 * Endpoints:
 *   GET    /ai/memory/:userId          → Get user's preferences (for system prompt injection)
 *   POST   /ai/memory/:userId          → Update preferences (called after each chat turn)
 *   DELETE /ai/memory/:userId          → Clear preferences (user data reset)
 *
 * LEARNING: This controller is the "long-term memory" API.
 * The Next.js chat handler calls GET /ai/memory/:userId at the start of each
 * session to inject past preferences into the system prompt.
 *
 * PRIVACY NOTE:
 *   In production, this endpoint must be secured:
 *   - JWT auth so users can only access their own preferences
 *   - GDPR: expose the DELETE endpoint publicly for "forget me" requests
 *   - Encrypt PII before storing in Redis
 */
@Controller('ai/memory')
export class MemoryController {
  constructor(private readonly memoryService: MemoryService) {}

  /**
   * GET /ai/memory/:userId
   * Called by Next.js at the start of a chat session to load user preferences.
   */
  @Get(':userId')
  async getPreferences(@Param('userId') userId: string) {
    const prefs = await this.memoryService.getUserPreferences(userId);
    return {
      statusCode: HttpStatus.OK,
      message: prefs ? 'User preferences loaded' : 'No preferences found (new user)',
      data: prefs,
      memoryContext: this.memoryService.buildMemoryContext(prefs),
    };
  }

  /**
   * POST /ai/memory/:userId
   * Body: Partial<UserPreferences>
   *
   * Called by the Next.js chat handler after each turn to update what
   * we know about the user based on the conversation.
   */
  @Post(':userId')
  async updatePreferences(
    @Param('userId') userId: string,
    @Body() updates: Partial<Omit<UserPreferences, 'userId' | 'lastUpdated'>>,
  ) {
    const updated = await this.memoryService.updateUserPreferences(userId, updates);
    return {
      statusCode: HttpStatus.OK,
      message: 'Preferences updated',
      data: updated,
    };
  }

  /**
   * DELETE /ai/memory/:userId
   * GDPR-compliant "forget me" endpoint — clears all stored preferences.
   */
  @Delete(':userId')
  async clearPreferences(@Param('userId') userId: string) {
    await this.memoryService.clearUserPreferences(userId);
    return {
      statusCode: HttpStatus.OK,
      message: `All preferences cleared for user ${userId}`,
    };
  }
}
