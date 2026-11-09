import { ThrottlerModule } from '@nestjs/throttler';
import { TokenBucketRedisStorage } from './token-bucket-redis.storage';
import Redis from 'ioredis';

/**
 * Throttle configuration — Token Bucket algorithm with Redis.
 */
const isUpstash = (process.env.REDIS_HOST || '').includes('upstash.io');
const useTls = process.env.REDIS_TLS === 'true' || isUpstash;

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  username: process.env.REDIS_USERNAME || undefined,
  tls: useTls ? {} : undefined,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null,
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
