import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  HttpException,
} from '@nestjs/common';
import { ProductRepository } from './product.repository';
import { FilterProductsDto } from './product.dto';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class ProductsService {
  constructor(private productRepo: ProductRepository, private redisService: RedisService) { }

  async findAll() {
    try {
      const products = await this.productRepo.getAllProducts();
      if (!products) throw new NotFoundException('Products not found');

      return {
        statusCode: 200,
        message: 'Products fetched successfully',
        data: products,
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  async findById(id: string) {
    try {
      const product = await this.productRepo.getById(id);
      if (!product) throw new NotFoundException('Product not found');

      return {
        statusCode: 200,
        message: 'Product fetched successfully',
        data: product,
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  async findAllCategories() {
    try {
      const categories = await this.productRepo.getAllCategories();
      if (!categories) throw new NotFoundException('Categories not found');

      return {
        statusCode: 200,
        message: 'Categories fetched successfully',
        data: categories,
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  async findAllSubCategories() {
    try {
      const subcategories = await this.productRepo.getAllSubCategories();
      if (!subcategories)
        throw new NotFoundException('Sub-Categories not found');

      return {
        statusCode: 200,
        message: 'Sub-categories fetched successfully',
        data: subcategories,
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  async findParticularSubCategories(category_id: string) {
    try {
      const subcategories =
        await this.productRepo.getParticularSubCategory(category_id);

      if (!subcategories)
        throw new NotFoundException('Sub-Categories not found');

      return {
        statusCode: 200,
        message: 'Sub-categories fetched successfully',
        data: subcategories,
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  async findByFilter(filters: FilterProductsDto) {
    try {
      const {
        name,
        categoryId,
        subcategoryId,
        minPrice,
        maxPrice,
        limit,
        offset,
      } = filters;

      let products: any = [];

      //redis product cache against a particualr product name with 30s TTL

      let cacheKey = "";
      if (name) {
        cacheKey = `products:name:${name}`;

        try {
          // Check if the filtered data is cached
          const cachedProducts = await this.redisService.get(cacheKey);
          if (cachedProducts) {
            console.log("Returning cached products data", cachedProducts);
            products = JSON.parse(cachedProducts);  // Return cached result
            return {
              statusCode: 200,
              message: 'Filtered products fetched successfully from cache',
              data: products,
            };
          }
        } catch (redisError) {
          console.warn(`Redis cache GET failed for key ${cacheKey}. Falling back to DB.`, redisError.message);
        }
      }

      products = await this.productRepo.getByFilter(
        name,
        categoryId,
        subcategoryId,
        minPrice,
        maxPrice,
        limit,
        offset,
      );

      if (products.length > 0 && cacheKey) {
        try {
          // Cache for 30 seconds
          await this.redisService.set(cacheKey, JSON.stringify(products), 30);
          console.log("Caching products by filter", products.length, cacheKey);
        } catch (redisError) {
          console.warn(`Redis cache SET failed for key ${cacheKey}.`, redisError.message);
        }
      }



      return {
        statusCode: 200,
        message: 'Filtered products fetched successfully',
        data: products,
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Centralized error handler
   */
  private handleError(error: any): never {
    console.error('API Error:', error);
    if (error instanceof HttpException) {
      throw error;
    }
    throw new InternalServerErrorException({
      statusCode: 500,
      message: 'Something went wrong',
    });
  }
}
