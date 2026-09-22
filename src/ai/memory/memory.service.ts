import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

// ─── Memory Architecture ──────────────────────────────────────────────────────
//
// SHORT-TERM (in-session):  the `messages[]` array passed with each request
//   → Already handled by the Vercel AI SDK on the Next.js side
//   → The LLM sees the full conversation turn by turn
//
// LONG-TERM (cross-session, THIS SERVICE):  stored in Redis
//   → User preferences inferred from past chats
//   → Injected into the system prompt at conversation start
//   → Survives browser refresh and new sessions
//
// ╔══════════════════ GOLD STANDARD ALTERNATIVE ═══════════════════════════════╗
// ║  Mem0 (https://mem0.ai) — managed AI memory layer                         ║
// ║  → Automatically extracts facts from conversations using an LLM          ║
// ║  → Deduplicates, organizes, and retrieves memories semantically          ║
// ║  → No manual JSON merging required                                        ║
// ║  → Free tier: 1000 monthly memories                                       ║
// ║                                                                            ║
// ║  Zep (https://getzep.com) — open-source, self-hosted                      ║
// ║  → Stores episodic + semantic memory, extracts entities automatically    ║
// ║  → Can summarize long conversation histories to save context tokens      ║
// ╚════════════════════════════════════════════════════════════════════════════╝

export interface UserPreferences {
  userId: string;
  maxBudget?: number;            // Inferred from past price filters
  preferredCategories?: string[]; // Categories they browse/buy most
  dietary?: string[];            // e.g. ['vegan', 'gluten-free']
  inductionSafe?: boolean;       // Induction cooking preference
  lastUpdated: string;           // ISO timestamp
}

const MEMORY_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const MEMORY_KEY_PREFIX = 'user:prefs:';

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(private readonly redisService: RedisService) {}

  // ──────────────────────────────────────────────────────────────────────────
  // Get a user's long-term preferences (injected into the agent's system prompt)
  // Returns null if the user is new (no preferences saved yet)
  // ──────────────────────────────────────────────────────────────────────────
  async getUserPreferences(userId: string): Promise<UserPreferences | null> {
    try {
      const raw = await this.redisService.get(`${MEMORY_KEY_PREFIX}${userId}`);
      if (!raw) return null;
      return JSON.parse(raw) as UserPreferences;
    } catch (err: any) {
      this.logger.warn(`Failed to load preferences for ${userId}: ${err?.message}`);
      return null;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Update a user's preferences (called after each conversation turn)
  //
  // LEARNING: In a basic setup, the Next.js chat handler calls this endpoint
  // after each response to update what we know about the user.
  //
  // In production, you'd use an LLM to EXTRACT preferences from the chat
  // history automatically (no manual field mapping needed).
  // ──────────────────────────────────────────────────────────────────────────
  async updateUserPreferences(
    userId: string,
    updates: Partial<Omit<UserPreferences, 'userId' | 'lastUpdated'>>,
  ): Promise<UserPreferences> {
    const existing = (await this.getUserPreferences(userId)) ?? {
      userId,
      lastUpdated: new Date().toISOString(),
    };

    const merged: UserPreferences = {
      ...existing,
      ...updates,
      // Merge arrays (deduplicate) rather than overwrite
      preferredCategories: [
        ...new Set([
          ...(existing.preferredCategories ?? []),
          ...(updates.preferredCategories ?? []),
        ]),
      ],
      dietary: [
        ...new Set([
          ...(existing.dietary ?? []),
          ...(updates.dietary ?? []),
        ]),
      ],
      userId,
      lastUpdated: new Date().toISOString(),
    };

    await this.redisService.set(
      `${MEMORY_KEY_PREFIX}${userId}`,
      JSON.stringify(merged),
      MEMORY_TTL_SECONDS,
    );

    this.logger.log(`Updated preferences for user ${userId}`);
    return merged;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Build the memory context string for injection into the system prompt
  //
  // LEARNING: The LLM uses this to personalize its responses.
  // Example output:
  //   "User preferences: Budget up to ₹2000. Interested in: Cookware, Kitchen.
  //    Induction cooking: Yes."
  // ──────────────────────────────────────────────────────────────────────────
  buildMemoryContext(prefs: UserPreferences | null): string {
    if (!prefs) return '';

    const parts: string[] = [];
    if (prefs.maxBudget) {
      parts.push(`Budget preference: up to ₹${prefs.maxBudget}`);
    }
    if (prefs.preferredCategories?.length) {
      parts.push(`Interested in: ${prefs.preferredCategories.join(', ')}`);
    }
    if (prefs.inductionSafe !== undefined) {
      parts.push(`Induction cooking: ${prefs.inductionSafe ? 'Yes' : 'No'}`);
    }
    if (prefs.dietary?.length) {
      parts.push(`Dietary preferences: ${prefs.dietary.join(', ')}`);
    }

    if (parts.length === 0) return '';

    return `\n\n--- USER MEMORY (from previous sessions) ---\n${parts.join('\n')}\n---`;
  }

  async clearUserPreferences(userId: string): Promise<void> {
    await this.redisService.delete(`${MEMORY_KEY_PREFIX}${userId}`);
    this.logger.log(`Cleared preferences for user ${userId}`);
  }
}
