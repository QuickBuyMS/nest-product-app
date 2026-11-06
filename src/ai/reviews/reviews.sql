-- ============================================================
-- Phase 6: AI Review Summarizer — DB Migration
-- Run this once in your QuickBuy MySQL database
-- ============================================================

CREATE TABLE IF NOT EXISTS reviews (
  review_id     INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id    INT           NOT NULL,
  user_id       VARCHAR(64)   NOT NULL,
  rating        TINYINT       NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title         VARCHAR(255)  NULL,
  body          TEXT          NOT NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Foreign key ensures only valid products can be reviewed
  CONSTRAINT fk_reviews_product FOREIGN KEY (product_id)
    REFERENCES products (product_id)
    ON DELETE CASCADE,

  -- One review per user per product
  UNIQUE KEY uq_user_product (user_id, product_id),

  -- Fast lookups by product (our most common query)
  INDEX idx_reviews_product_id (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Seed data — sample reviews for testing (adjust product IDs)
-- ============================================================

-- Replace 1, 2, 3 with real product_ids from your DB
INSERT IGNORE INTO reviews (product_id, user_id, rating, title, body) VALUES
  (1, 'user_001', 5, 'Absolutely love it!',    'This product exceeded all my expectations. Build quality is superb and delivery was quick. Would definitely buy again.'),
  (1, 'user_002', 4, 'Great value for money',  'Very happy with the purchase. Works exactly as described. Minor packaging issue but product itself is perfect.'),
  (1, 'user_003', 3, 'Decent but not perfect', 'It does the job but I expected a bit more premium feel. The price is fair though.'),
  (1, 'user_004', 5, 'Best I have used',       'Hands down the best product in this category. Fast shipping, great packaging, and excellent performance.'),
  (1, 'user_005', 2, 'Disappointed',           'Not what I expected from the photos. Quality seems lower than advertised. Customer service was helpful though.'),

  (2, 'user_001', 5, 'Premium quality',        'Outstanding build quality. Looks and feels expensive. Very satisfied with the purchase.'),
  (2, 'user_006', 4, 'Good product',           'Works well and matches the description. Shipping was a bit slow but the product is solid.'),
  (2, 'user_007', 1, 'Broke after a week',     'Very disappointed. Stopped working after just 7 days of normal use. Poor quality control.'),

  (3, 'user_002', 5, 'Highly recommended',     'Fantastic product! All my friends are asking where I got it. Excellent value.'),
  (3, 'user_008', 4, 'Mostly satisfied',       'Good product overall. A few minor issues but nothing major. Would buy again.'),
  (3, 'user_009', 3, 'Average experience',     'The product is okay. Not bad but nothing special either. Expected more features at this price point.');
