import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  HttpException,
} from '@nestjs/common';
import { ProductRepository } from './product.repository';
import { FilterProductsDto } from './product.dto';

@Injectable()
export class ProductsService {
  constructor(private productRepo: ProductRepository) {}

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

      const products = await this.productRepo.getByFilter(
        name,
        categoryId,
        subcategoryId,
        minPrice,
        maxPrice,
        limit,
        offset,
      );

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
    if (error instanceof HttpException) {
      throw error;
    }
    throw new InternalServerErrorException({
      statusCode: 500,
      message: 'Something went wrong',
    });
  }
}
