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
    return (rows as ProductRow[])[0] as ProductRow | undefined;
  }

  async getAllSubCategories() {
    const [rows] = await this.db.query(
      'SELECT c.category_id, c.name, s.subcategory_id, s.name FROM subcategories s LEFT JOIN categories c ON s.category_id = c.category_id; ',
    );
    return (rows as ProductRow[])[0] as ProductRow | undefined;
  }

  async getParticularSubCategory(category_id: string) {
    const [rows] = await this.db.query(
      "SELECT c.category_id, c.name, s.subcategory_id, s.name FROM subcategories s LEFT JOIN categories c ON s.category_id = c.category_id where c.category_id = '?'",
      [category_id],
    );
    return (rows as ProductRow[])[0] as ProductRow | undefined;
  }

  async getAllProducts() {
    const [rows] = await this.db.query('SELECT * FROM products');
    return (rows as ProductRow[])[0] as ProductRow | undefined;
  }

//   async findByName(name: string) {
//     const [rows] = await this.db.query('SELECT * FROM products WHERE name=?', [
//       name,
//     ]);
//     return (rows as ProductRow[])[0] as ProductRow | undefined;
//   }

  async getById(id: string) {
    const [rows] = await this.db.query('SELECT * FROM products WHERE id=?', [
      id,
    ]);
    return (rows as ProductRow[])[0] as ProductRow | undefined;
  }

  async getByFilter(
    name?: string,
    categoryId?: number,
    subcategoryId?: number,
    minPrice?: number,
    maxPrice?: number,
    limit?: number,
    offset?: number,
  ) {
    let query = `SELECT p.product_id, p.name, p.price, p.description, p.image_url, c.name, sc.name 
    FROM products p 
    INNER JOIN subcategories sc ON p.subcategory_id = sc.id
    INNER JOIN categories c ON sc.category_id = c.id
    WHERE 1=1
    ${categoryId ? 'AND c.id = ?' : ''}
    ${subcategoryId ? 'AND sc.id = ?' : ''}
    ${minPrice ? 'AND p.price >= ?' : ''}
    ${maxPrice ? 'AND p.price <= ?' : ''}
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?;`;
    const params: any[] = [
      ...(categoryId ? [categoryId] : []),
      ...(subcategoryId ? [subcategoryId] : []),
      ...(minPrice ? [minPrice] : []),
      ...(maxPrice ? [maxPrice] : []),
      limit,
      offset,
    ];

    if (name) {
      query += ' AND name LIKE ?';
      params.push(`%${name}%`);
    }
    const [rows] = await this.db.query(query, params);
    return (rows as ProductRow[])[0] as ProductRow | undefined;
  }
}
