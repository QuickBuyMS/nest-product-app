import { Module } from '@nestjs/common';
import { RedisService } from './redis.service';
@Module({
    providers: [RedisService],
    exports: [RedisService],  // Exporting RedisService for other modules to use
})
export class RedisModule { }