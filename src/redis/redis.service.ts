import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { env } from 'process';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
    private client: Redis;

    onModuleInit() {
        this.client = new Redis({
            host: env.REDIS_HOST || 'localhost',
            port: parseInt(env.REDIS_PORT || '6379', 10),
            // ── IMPORTANT: Redis Stack is required for vector search ──────────────
            // Start Redis Stack locally:
            //   docker run -d -p 6379:6379 redis/redis-stack:latest
            //
            // ╔══════════════════ GOLD STANDARD ALTERNATIVE ═══════════════════════╗
            // ║  Managed Redis: Redis Cloud (https://redis.io/cloud)               ║
            // ║  → Free 30MB tier, auto-scales, built-in Redis Stack modules       ║
            // ║  → Production: ~$15/mo for 250MB with persistence + replication    ║
            // ╚════════════════════════════════════════════════════════════════════╝
        });
    }

    onModuleDestroy() {
        this.client.quit();
    }

    async set(key: string, value: string, ttlInSeconds: number): Promise<void> {
        await this.client.set(key, value, 'EX', ttlInSeconds);
    }

    async get(key: string): Promise<string | null> {
        return this.client.get(key);
    }

    async delete(key: string): Promise<number> {
        return this.client.del(key);
    }

    /**
     * Execute any raw Redis command — required for Redis Stack modules
     * (FT.CREATE, FT.SEARCH, HSET with binary buffers, etc.)
     *
     * @example
     *   await this.redisService.callCommand('FT.CREATE', 'myIdx', 'ON', 'HASH', ...)
     */
    async callCommand(command: string, ...args: (string | number | Buffer)[]): Promise<any> {
        return (this.client as any).call(command, ...args);
    }
}