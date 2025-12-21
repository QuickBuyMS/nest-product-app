import { Inject } from '@nestjs/common';
import type { Pool } from 'mysql2/promise';

export type ProductRow = {
  product_id: string;
  name: string;
  subcategory_id: string;
  description: string;
  price: string;
  stock: string;
  image: string;
  created_at: Date;
  updated_at: Date;
};

export class ProductRepository {
  constructor(@Inject('DATABASE_CONNECTION') private readonly db: Pool) {}

  async getAllCategories() {
    const [rows] = await this.db.query('SELECT * FROM categories');
    return rows as any as ProductRow | undefined;
  }

  async getAllSubCategories() {
    const [rows] = await this.db.query(
      'SELECT c.category_id, c.name, s.subcategory_id, s.name FROM subcategories s LEFT JOIN categories c ON s.category_id = c.category_id; ',
    );
    return rows as any as ProductRow | undefined;
  }

  async getParticularSubCategory(category_id: string) {
    const [rows] = await this.db.query(
      'SELECT c.category_id, c.name, s.subcategory_id, s.name FROM subcategories s LEFT JOIN categories c ON s.category_id = c.category_id where c.category_id = ?',
      [category_id],
    );
    return rows as any as ProductRow | undefined;
  }

  async getAllProducts() {
    const [rows] = await this.db.query('SELECT * FROM products');
    return rows as any as ProductRow | undefined;
  }

  //   async findByName(name: string) {
  //     const [rows] = await this.db.query('SELECT * FROM products WHERE name=?', [
  //       name,
  //     ]);
  //     return (rows as ProductRow[])[0] as ProductRow | undefined;
  //   }

  async getById(id: string) {
    const [rows] = await this.db.query(
      'SELECT * FROM products WHERE product_id=?',
      [id],
    );
    return (rows as ProductRow[])[0] as ProductRow | undefined;
  }

  async getByFilter(
    name?: string,
    categoryId?: number,
    subcategoryId?: number,
    minPrice?: number,
    maxPrice?: number,
    limit = 10,
    offset = 0,
  ) {
    let query = `
    SELECT 
      p.product_id,
      p.name,
      p.price,
      p.description,
      p.image_url,
      c.name AS category_name,
      sc.name AS subcategory_name
    FROM products p
    INNER JOIN subcategories sc ON p.subcategory_id = sc.subcategory_id
    INNER JOIN categories c ON sc.category_id = c.category_id
    WHERE 1=1
      ${name ? 'AND p.name LIKE ?' : ''}
      ${categoryId ? 'AND c.category_id = ?' : ''}
      ${subcategoryId ? 'AND sc.subcategory_id = ?' : ''}
      ${minPrice ? 'AND p.price >= ?' : ''}
      ${maxPrice ? 'AND p.price <= ?' : ''}
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `;

    const params: any[] = [
      ...(name ? [`%${name}%`] : []),
      ...(categoryId ? [categoryId] : []),
      ...(subcategoryId ? [subcategoryId] : []),
      ...(minPrice ? [minPrice] : []),
      ...(maxPrice ? [maxPrice] : []),
      limit,
      offset,
    ];

    const [rows] = await this.db.query(query, params);
    return rows as ProductRow[];
  }
}
