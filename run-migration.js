/**
 * run-migration.js
 * One-shot script to create the reviews table and seed sample data.
 * Uses mysql2 which is already installed in the project.
 *
 * Run: node run-migration.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');

async function main() {
  const connection = await mysql.createConnection({
    host:     process.env.DB_HOST     || 'localhost',
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'QuickBuy',
    port:     Number(process.env.DB_PORT) || 3306,
    multipleStatements: true, // Required to run the whole .sql file at once
  });

  console.log('✅ Connected to MySQL — QuickBuy');

  // First: check what product_ids actually exist in the DB
  const [products] = await connection.query(
    'SELECT product_id FROM products ORDER BY product_id LIMIT 10'
  );

  if (products.length === 0) {
    console.error('❌ No products found in DB! Seed your products table first.');
    await connection.end();
    process.exit(1);
  }

  const ids = products.map(p => p.product_id);
  console.log('📦 Found product IDs:', ids.slice(0, 5), '...');

  // Use the first 3 real product IDs for the seed data
  const [id1, id2, id3] = [ids[0], ids[1] ?? ids[0], ids[2] ?? ids[0]];

  // Step 1: Create the reviews table
  const createTable = `
    CREATE TABLE IF NOT EXISTS reviews (
      review_id     INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
      product_id    INT           NOT NULL,
      user_id       VARCHAR(64)   NOT NULL,
      rating        TINYINT       NOT NULL CHECK (rating BETWEEN 1 AND 5),
      title         VARCHAR(255)  NULL,
      body          TEXT          NOT NULL,
      created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_reviews_product FOREIGN KEY (product_id)
        REFERENCES products (product_id)
        ON DELETE CASCADE,
      UNIQUE KEY uq_user_product (user_id, product_id),
      INDEX idx_reviews_product_id (product_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  await connection.query(createTable);
  console.log('✅ reviews table created (or already exists)');

  // Step 2: Seed with real product IDs from the DB
  const seedData = [
    [id1, 'user_001', 5, 'Absolutely love it!',    'This product exceeded all my expectations. Build quality is superb and delivery was quick. Would definitely buy again.'],
    [id1, 'user_002', 4, 'Great value for money',  'Very happy with the purchase. Works exactly as described. Minor packaging issue but product itself is perfect.'],
    [id1, 'user_003', 3, 'Decent but not perfect', 'It does the job but I expected a bit more premium feel. The price is fair though.'],
    [id1, 'user_004', 5, 'Best I have used',       'Hands down the best product in this category. Fast shipping, great packaging, and excellent performance.'],
    [id1, 'user_005', 2, 'Disappointed',           'Not what I expected from the photos. Quality seems lower than advertised. Customer service was helpful though.'],
    [id2, 'user_001', 5, 'Premium quality',        'Outstanding build quality. Looks and feels expensive. Very satisfied with the purchase.'],
    [id2, 'user_006', 4, 'Good product',           'Works well and matches the description. Shipping was a bit slow but the product is solid.'],
    [id2, 'user_007', 1, 'Broke after a week',     'Very disappointed. Stopped working after just 7 days of normal use. Poor quality control.'],
    [id3, 'user_002', 5, 'Highly recommended',     'Fantastic product! All my friends are asking where I got it. Excellent value.'],
    [id3, 'user_008', 4, 'Mostly satisfied',       'Good product overall. A few minor issues but nothing major. Would buy again.'],
    [id3, 'user_009', 3, 'Average experience',     'The product is okay. Not bad but nothing special either. Expected more features at this price point.'],
  ];

  let inserted = 0;
  let skipped  = 0;

  for (const [product_id, user_id, rating, title, body] of seedData) {
    try {
      await connection.query(
        `INSERT IGNORE INTO reviews (product_id, user_id, rating, title, body) VALUES (?, ?, ?, ?, ?)`,
        [product_id, user_id, rating, title, body]
      );
      inserted++;
    } catch (err) {
      console.warn(`  ⚠ Skipped (${user_id}, product ${product_id}): ${err.message}`);
      skipped++;
    }
  }

  console.log(`✅ Seed complete — ${inserted} rows inserted, ${skipped} skipped (duplicates)`);

  // Step 3: Verify
  const [rows] = await connection.query(
    'SELECT product_id, COUNT(*) as review_count, ROUND(AVG(rating),1) as avg_rating FROM reviews GROUP BY product_id ORDER BY product_id'
  );

  console.log('\n📊 Review table summary:');
  console.table(rows);
  console.log('\n🎯 Ready! Test with:');
  console.log(`   GET http://localhost:7002/api/ai/reviews/${id1}/summary`);

  await connection.end();
}

main().catch(err => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
