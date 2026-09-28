import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { RagService } from '../rag/rag.service';
import { ProductRepository } from '../../products/product.repository';

@Injectable()
export class ComparisonService {
  private readonly logger = new Logger(ComparisonService.name);

  constructor(
    private readonly ragService: RagService,
    private readonly productRepo: ProductRepository,
  ) {}

  async compareProduct(productId: string) {
    // 1. Fetch target product details
    const targetProduct = await this.productRepo.getById(productId);
    if (!targetProduct) {
      throw new NotFoundException('Product not found');
    }

    // 2. Fetch similar products from the DB based on the same subcategory
    const searchResults = await this.productRepo.getByFilter(
      undefined, // name
      undefined, // categoryId
      Number(targetProduct.subcategory_id), // subcategoryId
      undefined, // minPrice
      undefined, // maxPrice
      5,         // limit
      0          // offset
    );

    // Filter out the target product from the similar results
    const similarProducts = searchResults.filter(
      (p) => String(p.product_id) !== String(productId)
    ).slice(0, 4); // Keep top 4 similar products

    if (similarProducts.length === 0) {
      return {
        targetProduct,
        comparisonTable: 'No similar products found for comparison.',
        similarProducts: [],
      };
    }

    // 3. Construct the prompt for the LLM
    const targetInfo = `
ID: ${targetProduct.product_id}
Name: ${targetProduct.name}
Price: ₹${targetProduct.price}
Description: ${targetProduct.description || 'N/A'}
`.trim();

    const othersInfo = similarProducts
      .map(
        (p: any) => `
ID: ${p.product_id}
Name: ${p.name}
Price: ₹${p.price}
Category: ${p.category_name || 'N/A'}
Subcategory: ${p.subcategory_name || 'N/A'}
Description: ${p.description || 'N/A'}
`.trim()
      )
      .join('\n\n---\n\n');

    try {
      // Use Gemini to generate the comparison table
      const { text: comparisonTable } = await generateText({
        model: google('gemini-3.6-flash'),
        system: `You are an expert e-commerce product comparison agent for QuickBuy. 
Your goal is to compare a target product against a list of similar products and output a beautifully formatted Markdown comparison table.
Highlight key differences in features, specifications, and prices. 
Additionally, provide a brief 1-2 sentence recommendation or summary below the table.
Do NOT output anything other than the table and the brief summary.`,
        prompt: `Here is the target product the user is currently viewing:\n\n${targetInfo}\n\nHere are the similar products available for comparison:\n\n${othersInfo}\n\nPlease generate a detailed comparison table.`,
      });

      return {
        targetProduct,
        comparisonTable,
        similarProducts,
      };
    } catch (err: any) {
      this.logger.error(`Failed to generate comparison: ${err?.message}`);
      
      const isTransient =
        err?.message?.includes('high demand') ||
        err?.message?.includes('UNAVAILABLE') ||
        (err?.lastError as any)?.statusCode === 503;

      if (isTransient) {
        return {
          targetProduct,
          comparisonTable: 'The AI comparison agent is temporarily unavailable due to high demand. Please try again later.',
          similarProducts,
        };
      }
      throw err;
    }
  }
}
