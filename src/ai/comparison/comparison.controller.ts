import { Controller, Get, Param, HttpStatus } from '@nestjs/common';
import { ComparisonService } from './comparison.service';

@Controller('ai/compare')
export class ComparisonController {
  constructor(private readonly comparisonService: ComparisonService) {}

  @Get(':productId')
  async compare(@Param('productId') productId: string) {
    const result = await this.comparisonService.compareProduct(productId);

    return {
      statusCode: HttpStatus.OK,
      message: 'Product comparison generated successfully',
      data: result,
    };
  }
}
