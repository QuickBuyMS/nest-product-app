import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProductsModule } from './products/product.module';
import { DatabaseModule } from './db/database.module';
import { ThrottleConfig } from './throttle/throttle.config';

@Module({
  imports: [ProductsModule, DatabaseModule, ThrottleConfig],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
