import { ThrottlerModule } from '@nestjs/throttler';
import { TokenBucketRedisStorage } from './token-bucket-redis.storage';
import Redis from 'ioredis';

/**
 * Throttle configuration — Token Bucket algorithm with Redis.
 *
 * How the token bucket works:
 *   - Each client IP starts with a full bucket of `limit` tokens.
 *   - Every request consumes 1 token.
 *   - Tokens refill at a steady rate: `limit / (ttl / 1000)` tokens/sec.
 *   - A depleted bucket refills completely in exactly `ttl` milliseconds.
 *   - Clients can burst up to `limit` requests instantly, then must
 *     wait for tokens to refill — enforcing a smooth long-term rate.
 *
 * Environment variables:
 *   REDIS_HOST  — Redis server hostname (default: localhost)
 *   REDIS_PORT  — Redis server port     (default: 6379)
 */
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
});

export const ThrottleConfig = ThrottlerModule.forRoot({
  throttlers: [
    {
      name: 'default',
      ttl: 60000, // 60 seconds — full refill window
      limit: 10,  // bucket capacity (max burst)
    },
  ],
  storage: new TokenBucketRedisStorage(redis),
});
