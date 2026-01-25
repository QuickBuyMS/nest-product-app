import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ProductsService } from './products.service';
import { FilterProductsDto } from './product.dto';
import { ClientProxy } from '@nestjs/microservices';
import { Inject, Headers } from '@nestjs/common';

@Controller('catalogue')
export class ProductsController {
  constructor(
    private productService: ProductsService,
    @Inject('AUTH_MICROSERVICE') private readonly authClient: ClientProxy,
  ) {}

  // ---------------- Get all products ----------------
  @Get('products')
  async getProducts() {
    return this.productService.findAll();
  }

  // ---------------- Get all categories ----------------
  @Get('categories')
  async getAllCategories() {
    return this.productService.findAllCategories();
  }

  // ---------------- Get all sub-categories ----------------
  @Get('subcategories')
  async getAllSubCategories() {
    return this.productService.findAllSubCategories();
  }

  // ---------------- Get particular sub-categories by category ID ----------------
  @Get('subcategories/:category_id')
  async getParticularSubCategories(@Param('category_id') category_id: string) {
    return this.productService.findParticularSubCategories(category_id);
  }

  // ---------------- Get products by filter ----------------
  @Post('products/filter')
  async getProductsByFilter(@Body() filters: FilterProductsDto) {
    return this.productService.findByFilter(filters);
  }

  // ---------------- Get a product by ID ----------------
  @Get(':id')
  async getParticularProduct(@Param('id') id: string) {
    return this.productService.findById(id);
  }
}
