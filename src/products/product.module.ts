import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './product.controller';
import { ProductRepository } from './product.repository';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TokenMiddleware } from '../middleware/verifyToken';

import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'AUTH_MICROSERVICE',
        transport: Transport.TCP,
        options: { port: 5001 },
      },
    ]),
    RedisModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService, ProductRepository],
  exports: [ProductsService, ProductRepository],
})
export class ProductsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // consumer.apply(TokenMiddleware).forRoutes(ProductsController); // applies to all routes in product controller
  }
}
