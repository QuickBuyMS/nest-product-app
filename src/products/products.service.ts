import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ProductRepository } from './product.repository';
import { FilterProductsDto } from './product.dto';

@Injectable()
export class ProductsService {
  constructor(private productRepo: ProductRepository) {}

  async findAll() {
    const products = await this.productRepo.getAllProducts();
    if (!products) throw new NotFoundException('Products not found');
    return products;
  }

  async findById(id: string) {
    const product = await this.productRepo.getById(id);
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async findAllCategories() {
    const categories = await this.productRepo.getAllCategories();
    if (!categories) throw new NotFoundException('Categories not found');
    return categories;
  }

  async findAllSubCategories() {
    const subcategories = await this.productRepo.getAllSubCategories();
    if (!subcategories) throw new NotFoundException('Sub-Categories not found');
    return subcategories;
  }

  async findParticularSubCategories(category_id: string) {
    const subcategories =
      await this.productRepo.getParticularSubCategory(category_id);
    if (!subcategories) throw new NotFoundException('Sub-Categories not found');
    return subcategories;
  }

  async findByFilter(filters: FilterProductsDto) {
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
    if (!products) throw new NotFoundException('Product not found');
    return products;
  }
}
