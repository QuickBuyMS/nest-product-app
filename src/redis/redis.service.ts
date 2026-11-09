import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { env } from 'process';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
    private client: Redis;

    onModuleInit() {
        const isUpstash = (env.REDIS_HOST || '').includes('upstash.io');
        const useTls = env.REDIS_TLS === 'true' || isUpstash;

        this.client = new Redis({
            host: env.REDIS_HOST || 'localhost',
            port: parseInt(env.REDIS_PORT || '6379', 10),
            password: env.REDIS_PASSWORD || undefined,
            username: env.REDIS_USERNAME || undefined,
            tls: useTls ? {} : undefined,
            enableOfflineQueue: false,
            maxRetriesPerRequest: 1,
            retryStrategy: () => null,
        });
        this.client.on('error', () => {});
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
