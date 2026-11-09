/**
 * migrate-remote-db.js
 *
 * Full-setup script to migrate the entire database to TiDB Cloud (or any remote MySQL).
 * Performs:
 *   1. Connects with SSL support
 *   2. Creates QuickBuy database if not present
 *   3. Runs full schema & seed from seed.sql (Categories, Subcategories, Products, Users, etc.)
 *   4. Runs reviews schema & seed from reviews.sql
 *   5. Verifies row counts across all key tables
 *
 * Usage:
 *   node migrate-remote-db.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function main() {
  const host = process.env.DB_HOST || 'localhost';
  const port = Number(process.env.DB_PORT) || 3306;
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'QuickBuy';
  const useSSL = process.env.DB_SSL === 'true';

  console.log('🔄 Connecting to MySQL server...');
  console.log(`   Host: ${host}:${port}`);
  console.log(`   User: ${user}`);
  console.log(`   Target DB: ${database}`);
  console.log(`   SSL: ${useSSL ? 'Enabled (rejectUnauthorized: false)' : 'Disabled'}\n`);

  // Step 1: Connect to server (without DB first, in case DB doesn't exist)
  let conn;
  try {
    conn = await mysql.createConnection({
      host,
      port,
      user,
      password,
      multipleStatements: true,
      ssl: useSSL ? { rejectUnauthorized: false } : undefined,
    });
    console.log('✅ Connected to MySQL server successfully');
  } catch (err) {
    console.error('❌ Failed to connect to MySQL server:', err.message);
    process.exit(1);
  }

  // Step 2: Create database if missing and switch to it
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await conn.query(`USE \`${database}\`;`);
    console.log(`✅ Using database "${database}"`);
  } catch (err) {
    console.error(`❌ Could not select database "${database}":`, err.message);
    await conn.end();
    process.exit(1);
  }

  // Step 3: Run base seed.sql
  const seedPath = path.resolve(__dirname, '../seed.sql');
  if (fs.existsSync(seedPath)) {
    console.log('\n📄 Executing seed.sql (tables & initial catalog data)...');
    const seedSql = fs.readFileSync(seedPath, 'utf8');
    try {
      await conn.query(seedSql);
      console.log('✅ Base tables and catalog seeded successfully');
    } catch (err) {
      console.warn('⚠️  Notice while executing seed.sql:', err.message);
    }
  } else {
    console.warn(`⚠️  seed.sql not found at ${seedPath}`);
  }

  // Step 4: Run reviews schema & seed
  console.log('\n📄 Creating reviews table and seeding sample reviews...');
  const createReviewsTable = `
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
  await conn.query(createReviewsTable);
  console.log('✅ Reviews table verified');

  // Check product IDs in the DB to seed reviews against real IDs
  const [products] = await conn.query('SELECT product_id FROM products ORDER BY product_id LIMIT 10');
  if (products.length > 0) {
    const ids = products.map(p => p.product_id);
    const id1 = ids[0];
    const id2 = ids[1] ?? ids[0];
    const id3 = ids[2] ?? ids[0];

    const sampleReviews = [
      [id1, 'user_001', 5, 'Absolutely love it!', 'This product exceeded all my expectations. Build quality is superb and delivery was quick. Would definitely buy again.'],
      [id1, 'user_002', 4, 'Great value for money', 'Very happy with the purchase. Works exactly as described. Minor packaging issue but product itself is perfect.'],
      [id1, 'user_003', 3, 'Decent but not perfect', 'It does the job but I expected a bit more premium feel. The price is fair though.'],
      [id1, 'user_004', 5, 'Best I have used', 'Hands down the best product in this category. Fast shipping, great packaging, and excellent performance.'],
      [id1, 'user_005', 2, 'Disappointed', 'Not what I expected from the photos. Quality seems lower than advertised. Customer service was helpful though.'],
      [id2, 'user_001', 5, 'Premium quality', 'Outstanding build quality. Looks and feels expensive. Very satisfied with the purchase.'],
      [id2, 'user_006', 4, 'Good product', 'Works well and matches the description. Shipping was a bit slow but the product is solid.'],
      [id2, 'user_007', 1, 'Broke after a week', 'Very disappointed. Stopped working after just 7 days of normal use. Poor quality control.'],
      [id3, 'user_002', 5, 'Highly recommended', 'Fantastic product! All my friends are asking where I got it. Excellent value.'],
      [id3, 'user_008', 4, 'Mostly satisfied', 'Good product overall. A few minor issues but nothing major. Would buy again.'],
      [id3, 'user_009', 3, 'Average experience', 'The product is okay. Not bad but nothing special either. Expected more features at this price point.'],
    ];

    let inserted = 0;
    for (const [pid, uid, rating, title, body] of sampleReviews) {
      try {
        await conn.query(
          `INSERT IGNORE INTO reviews (product_id, user_id, rating, title, body) VALUES (?, ?, ?, ?, ?)`,
          [pid, uid, rating, title, body]
        );
        inserted++;
      } catch (err) {
        // ignore duplicate
      }
    }
    console.log(`✅ Seeded ${inserted} customer reviews`);
  }

  // Step 5: Verification Summary
  console.log('\n📊 ── Verification Summary ──');
  const tables = ['categories', 'subcategories', 'products', 'users', 'reviews'];
  for (const tbl of tables) {
    try {
      const [rows] = await conn.query(`SELECT COUNT(*) as count FROM \`${tbl}\``);
      console.log(`   • ${tbl.padEnd(16)} : ${rows[0].count} rows`);
    } catch {
      console.log(`   • ${tbl.padEnd(16)} : (table not queried)`);
    }
  }

  console.log('\n🎉 Database setup and migration complete! Ready for Render deployment.\n');
  await conn.end();
}

main().catch(err => {
  console.error('\n❌ Migration failed:', err);
  process.exit(1);
});

