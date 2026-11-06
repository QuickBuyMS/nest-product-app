import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'mysql2/promise';

export interface ReviewRow {
  review_id: number;
  product_id: number;
  user_id: string;
  rating: number;
  title: string | null;
  body: string;
  created_at: Date;
}

@Injectable()
export class ReviewRepository {
  constructor(@Inject('DATABASE_CONNECTION') private readonly db: Pool) {}

  /**
   * Fetch all reviews for a given product.
   * LEARNING: We only fetch what the AI needs — body + rating + title.
   * Avoid SELECT * to keep payloads small and prompts efficient.
   */
  async getByProductId(productId: string): Promise<ReviewRow[]> {
    const [rows] = await this.db.query(
      `SELECT review_id, product_id, user_id, rating, title, body, created_at
       FROM reviews
       WHERE product_id = ?
       ORDER BY created_at DESC`,
      [productId],
    );
    return rows as ReviewRow[];
  }

  /**
   * Insert a single review. Returns the new review_id.
   * LEARNING: insertId is only available on INSERT results in mysql2.
   */
  async create(
    productId: string,
    userId: string,
    rating: number,
    body: string,
    title?: string,
  ): Promise<number> {
    const [result] = await this.db.query(
      `INSERT INTO reviews (product_id, user_id, rating, title, body)
       VALUES (?, ?, ?, ?, ?)`,
      [productId, userId, rating, title ?? null, body],
    ) as any;
    return result.insertId as number;
  }

  /**
   * Count total reviews for a product (lightweight — used by the status endpoint).
   */
  async countByProductId(productId: string): Promise<number> {
    const [rows] = await this.db.query(
      'SELECT COUNT(*) AS total FROM reviews WHERE product_id = ?',
      [productId],
    ) as any;
    return Number((rows as any[])[0]?.total ?? 0);
  }

  /**
   * Delete a specific review (e.g. moderation action).
   */
  async delete(reviewId: number): Promise<void> {
    await this.db.query('DELETE FROM reviews WHERE review_id = ?', [reviewId]);
  }
}
