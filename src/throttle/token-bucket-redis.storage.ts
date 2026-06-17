import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Matches @nestjs/throttler's ThrottlerStorageRecord shape.
 * Defined inline because the type is not re-exported from the package barrel.
 */
export interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Token Bucket rate-limiter backed by Redis.
 *
 * How it works:
 *   - Every client (keyed by IP) gets a "bucket" with `capacity` tokens.
 *   - Tokens refill at a steady rate: `capacity / (ttl / 1000)` tokens/sec,
 *     so a fully-drained bucket takes exactly `ttl` ms to refill.
 *   - Each request consumes 1 token. If the bucket is empty → 429.
 *   - The bucket can never exceed `capacity`, allowing short bursts up to
 *     that limit while still enforcing a long-term average rate.
 *
 * All state mutations happen inside a single Lua script executed atomically
 * in Redis, so this is safe for multi-instance / clustered deployments.
 */
@Injectable()
export class TokenBucketRedisStorage implements OnModuleDestroy {
  private scriptSha: string | null = null;

  /**
   * Lua script for atomic token bucket operations.
   *
   * KEYS[1]  = bucket key  (e.g. "throttle:default:<ip>")
   * ARGV[1]  = capacity    (max tokens = limit from config)
   * ARGV[2]  = refill rate (tokens per second)
   * ARGV[3]  = now         (current time in ms)
   * ARGV[4]  = key TTL     (seconds — keeps Redis clean)
   *
   * Returns: [totalHits, timeToExpireMs, isBlocked (0|1), timeToBlockExpireMs]
   */
  private readonly LUA_TOKEN_BUCKET = `
    local key          = KEYS[1]
    local capacity     = tonumber(ARGV[1])
    local refillPerSec = tonumber(ARGV[2])
    local nowMs        = tonumber(ARGV[3])
    local ttlSec       = tonumber(ARGV[4])

    -- Read current bucket state
    local data         = redis.call('HMGET', key, 'tokens', 'last_refill_ms')
    local tokens       = tonumber(data[1])
    local lastRefillMs = tonumber(data[2])

    -----------------------------------------------------------------
    -- First request ever: initialise with a full bucket, consume 1
    -----------------------------------------------------------------
    if tokens == nil then
      tokens = capacity - 1
      redis.call('HMSET', key, 'tokens', tokens, 'last_refill_ms', nowMs)
      redis.call('EXPIRE', key, ttlSec)
      --             totalHits           timeToExpire   blocked  blockExpire
      return { capacity - tokens, ttlSec * 1000,    0,       0          }
    end

    -----------------------------------------------------------------
    -- Refill tokens based on elapsed time
    -----------------------------------------------------------------
    local elapsedMs  = math.max(0, nowMs - lastRefillMs)
    local tokensToAdd = math.floor(elapsedMs * refillPerSec / 1000)

    if tokensToAdd > 0 then
      tokens       = math.min(capacity, tokens + tokensToAdd)
      lastRefillMs = nowMs
    end

    -----------------------------------------------------------------
    -- Try to consume one token
    -----------------------------------------------------------------
    if tokens > 0 then
      tokens = tokens - 1
      redis.call('HMSET', key, 'tokens', tokens, 'last_refill_ms', lastRefillMs)
      redis.call('EXPIRE', key, ttlSec)
      return { capacity - tokens, ttlSec * 1000, 0, 0 }
    end

    -- Bucket empty → blocked
    redis.call('EXPIRE', key, ttlSec)
    local msUntilNextToken = math.ceil(1000 / refillPerSec)
    return { capacity + 1, ttlSec * 1000, 1, msUntilNextToken }
  `;

  constructor(private readonly redis: Redis) {}

  /**
   * Called by ThrottlerGuard on every request.
   *
   * Maps the token bucket result onto the ThrottlerStorageRecord shape
   * so the guard can set standard rate-limit headers and throw 429s.
   *
   * Header mapping:
   *   X-RateLimit-Limit     = limit            (= bucket capacity)
   *   X-RateLimit-Remaining = limit - totalHits (= tokens left)
   *   Retry-After           = timeToBlockExpire (ms until next token)
   */
  async increment(
    key: string,
    ttl: number,            // window in ms from throttler config
    limit: number,          // max requests  = bucket capacity
    _blockDuration: number, // unused — token bucket doesn't hard-block
    _throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const capacity = limit;
    const ttlSec = Math.ceil(ttl / 1000);
    const refillPerSec = capacity / ttlSec; // full refill over one TTL window
    const nowMs = Date.now();

    const result = await this.evalScript(key, capacity, refillPerSec, nowMs, ttlSec);
    const [totalHits, timeToExpire, blocked, timeToBlockExpire] = result;

    return {
      totalHits,
      timeToExpire,
      isBlocked: blocked === 1,
      timeToBlockExpire,
    };
  }

  /** Run the Lua script via EVALSHA with automatic cache-miss reload. */
  private async evalScript(
    key: string,
    capacity: number,
    refillPerSec: number,
    nowMs: number,
    ttlSec: number,
  ): Promise<number[]> {
    if (!this.scriptSha) {
      this.scriptSha = (await this.redis.script(
        'LOAD',
        this.LUA_TOKEN_BUCKET,
      )) as string;
    }

    try {
      return (await this.redis.evalsha(
        this.scriptSha, 1, key,
        capacity, refillPerSec, nowMs, ttlSec,
      )) as number[];
    } catch {
      // Script evicted from Redis script cache — reload once
      this.scriptSha = (await this.redis.script(
        'LOAD',
        this.LUA_TOKEN_BUCKET,
      )) as string;

      return (await this.redis.evalsha(
        this.scriptSha, 1, key,
        capacity, refillPerSec, nowMs, ttlSec,
      )) as number[];
    }
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
