/**
 * seed-all-reviews.js
 * Seeds comprehensive customer reviews for all 25 products in QuickBuy.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const productReviews = {
  1: [ // MacBook Pro M3
    ['user_101', 5, 'Unmatched M3 performance & battery', 'The M3 chip handles heavy 4K video editing without breaking a sweat. Battery easily lasts 16+ hours.'],
    ['user_102', 5, 'Best display on any laptop', 'The Liquid Retina XDR screen is stunning. Keyboard and trackpad are best in class.'],
    ['user_103', 4, 'Great machine but expensive', 'Performance is incredible, though upgrading unified memory at purchase gets pricey.'],
    ['user_104', 3, 'Heavy for frequent travel', 'Noticeably thicker and heavier than the MacBook Air. Excellent power if you stay at a desk.'],
    ['user_105', 5, 'Silent and cool', 'Fans rarely turn on during coding and software development workloads. Worth every penny.']
  ],
  2: [ // Dell XPS 13
    ['user_106', 4, 'Gorgeous InfinityEdge display', 'Nearly borderless display looks futuristic. Build quality is sleek and premium.'],
    ['user_107', 5, 'The perfect portable Windows machine', 'Lightweight, fast startup with Windows Hello, and great keyboard travel.'],
    ['user_108', 3, 'Limited port selection', 'You definitely need USB-C dongles for legacy USB-A or HDMI cables.'],
    ['user_109', 4, 'Snappy for everyday productivity', 'Handles dozens of browser tabs and Office apps effortlessly. Battery life is decent around 9 hours.']
  ],
  3: [ // Lenovo ThinkPad X1
    ['user_110', 5, 'Legendary keyboard experience', 'Typing on the ThinkPad keyboard is unrivaled. Perfect tactile response for writers and programmers.'],
    ['user_111', 4, 'Rugged enterprise reliability', 'Built like a tank with military-grade durability yet remarkably light.'],
    ['user_112', 4, 'Fast performance and good security', 'Fingerprint reader and privacy shutter on webcam work seamlessly.'],
    ['user_113', 3, 'Speakers could be louder', 'Audio quality is acceptable for Zoom calls but lacks punch for music and movies.']
  ],
  4: [ // Asus ROG Zephyrus
    ['user_114', 5, 'Beast of a gaming laptop', 'Runs Cyberpunk and AAA titles at ultra settings with smooth 144Hz refresh rates.'],
    ['user_115', 4, 'Sleek chassis for a gaming rig', 'Surprisingly slim compared to older bulky gaming laptops. RGB keyboard lighting looks fantastic.'],
    ['user_116', 3, 'Fans get loud under full GPU load', 'Expect noticeable fan noise while gaming; wear headphones for the best experience.'],
    ['user_117', 5, 'Crisp QHD display and fast thermals', 'Cooling system keeps CPU temperatures under control during long gaming sessions.']
  ],
  5: [ // HP Envy x360
    ['user_118', 5, 'Versatile 2-in-1 touchscreen', 'Flipping into tent mode for Netflix or tablet mode for sketching with a stylus works great.'],
    ['user_119', 4, 'Great value convertible', 'Sturdy 360-degree hinge, bright touchscreen, and good responsive trackpad.'],
    ['user_120', 4, 'Solid battery life for students', 'Easily gets through a full day of college lectures and note-taking.'],
    ['user_121', 2, 'A bit heavy in one-handed tablet mode', 'Tablet mode feels bulky to hold for long reading sessions, better rested on a lap.']
  ],
  6: [ // iPhone 15 Pro
    ['user_122', 5, 'Titanium design feels so much lighter', 'The weight reduction from previous Pro models is immediately noticeable. Feels great in hand.'],
    ['user_123', 5, 'Exceptional camera system', 'Action Mode and 5x optical zoom produce studio-grade photos and video footage.'],
    ['user_124', 4, 'USB-C transition is finally here', 'Charging with standard USB-C cables makes traveling so much simpler.'],
    ['user_125', 3, 'Action button needs more custom actions', 'Action button is handy for the flashlight, but iOS limits running complex multi-actions easily.'],
    ['user_126', 5, 'Flawless 120Hz ProMotion smoothness', 'Dynamic Island notifications and silky smooth scrolling make everyday use a joy.']
  ],
  7: [ // Samsung Galaxy S24
    ['user_127', 5, 'Galaxy AI features are super practical', 'Circle to Search and real-time live call translation are genuinely useful in daily life.'],
    ['user_128', 5, 'Brightest Dynamic AMOLED screen', 'Screen visibility under direct outdoor sunlight is unmatched. Vibrant colors and deep blacks.'],
    ['user_129', 4, 'Compact flagship size', 'Fits comfortably in one hand and pockets without feeling like a tablet.'],
    ['user_130', 4, 'Good battery and fast charging', 'Full charge in under an hour and easily lasts throughout a busy workday.']
  ],
  8: [ // Google Pixel 8
    ['user_131', 5, 'Pure Android & unmatched computational photography', 'Point-and-shoot camera consistency is the best on any smartphone. Magic Eraser is magic.'],
    ['user_132', 4, '7 years of OS updates is reassuring', 'Knowing this phone will receive updates until 2030 makes it great value.'],
    ['user_133', 3, 'Tensor G3 warms up during gaming', 'Gets slightly warm when recording 4K video or playing 3D games for extended periods.'],
    ['user_134', 5, 'Compact design and smooth haptics', 'The rounded corners and matte frame feel very ergonomic. Haptic feedback is top tier.']
  ],
  9: [ // OnePlus 12
    ['user_135', 5, 'Insanely fast 100W charging', 'Goes from 1% to 100% in around 25 minutes! Game changer for busy mornings.'],
    ['user_136', 5, 'Flagship Snapdragon 8 Gen 3 speed', 'Zero lag or stuttering across heavy multitasking and gaming.'],
    ['user_137', 4, 'Alert slider is back and handy', 'Physical toggle between Silent, Vibrate, and Ring should be on every phone.'],
    ['user_138', 4, 'Hasselblad color calibration looks natural', 'Portraits and landscape shots have natural skin tones and rich dynamic range.']
  ],
  10: [ // Nothing Phone (2)
    ['user_139', 5, 'The Glyph interface turns heads', 'Custom LED light patterns for contacts and timers are both cool and useful.'],
    ['user_140', 4, 'Clean Nothing OS without bloatware', 'Minimalist monochrome design aesthetic with fast, fluid animations.'],
    ['user_141', 4, 'Good dual 50MP cameras', 'Shoots sharp photos in daytime. Video stabilization is smooth.'],
    ['user_142', 3, 'No telephoto zoom lens', 'Zooming past 3x loses detail compared to dedicated zoom flagships.']
  ],
  11: [ // Sony WH-1000XM5
    ['user_143', 5, 'King of active noise cancellation', 'Silences airplane engine rumble and noisy coffee shops completely.'],
    ['user_144', 5, 'Warm and rich bass response', 'Soundstage is expansive with deep, tight bass and clear vocals. Sony app EQ is powerful.'],
    ['user_145', 4, 'Extremely comfortable plush earcups', 'Wore them on a 12-hour flight with zero ear fatigue or headache.'],
    ['user_146', 3, 'Does not fold into a compact shape', 'The redesigned headband is comfy but the travel case is larger than the XM4.']
  ],
  12: [ // AirPods Pro 2
    ['user_147', 5, 'Seamless Apple ecosystem pairing', 'Instant switching between iPhone, iPad, and MacBook works like magic.'],
    ['user_148', 5, 'Adaptive Audio and Transparency mode are unrivaled', 'Transparency mode sounds like you are wearing nothing in your ears at all.'],
    ['user_149', 4, 'Great mic clarity for phone calls', 'Background noise suppression during phone calls on windy streets is impressive.'],
    ['user_150', 4, 'Lanyard loop and speaker on case are helpful', 'Find My Precision Finding with the case beeping has saved me multiple times.']
  ],
  13: [ // Bose QuietComfort
    ['user_151', 5, 'Signature Bose comfort', 'Lightweight clamping force makes these the most comfortable over-ear headphones to wear all day.'],
    ['user_152', 4, 'Balanced sound profile', 'Natural, clear highs and warm mids that do not cause listening fatigue.'],
    ['user_153', 4, 'Physical buttons over touch controls', 'Love having real clicky buttons for volume and track skip instead of finicky touch swipes.']
  ],
  14: [ // Sennheiser Momentum
    ['user_154', 5, 'Audiophile-grade sound quality', 'Incredible instrument separation and detail. You hear subtle layers in acoustic music.'],
    ['user_155', 5, 'Unbelievable 60-hour battery life', 'I only have to charge these once every two weeks with daily commuting use.'],
    ['user_156', 4, 'Premium fabric headband finish', 'Looks stylish and modern. Ear cushions seal well around glasses.']
  ],
  15: [ // Classic White T-Shirt
    ['user_157', 5, 'High quality thick cotton', 'Not see-through at all! Holds its shape and collar elasticity even after several machine washes.'],
    ['user_158', 5, 'Perfect wardrobe staple', 'Breathable 100% combed cotton. Works great under jackets or on its own.'],
    ['user_159', 4, 'True to size fit', 'Sizing is spot on with a relaxed modern cut.'],
    ['user_160', 3, 'Shrunk slightly in high heat dryer', 'Recommend line drying or tumble drying on low heat to prevent minor shrinkage.']
  ],
  16: [ // Slim Fit Denim Jeans
    ['user_161', 5, 'Just the right amount of stretch', 'Comfortable to wear all day even while seated at a desk. Does not feel stiff.'],
    ['user_162', 4, 'Modern flattering slim silhouette', 'Tapers nicely down the leg without being too tight around the calves.'],
    ['user_163', 4, 'Durable denim fabric', 'Color wash looks authentic and seams are reinforced well.'],
    ['user_164', 3, 'Waist runs slightly snug', 'If you are in between sizes, consider ordering one size up.']
  ],
  17: [ // Leather Jacket
    ['user_165', 5, 'Authentic premium leather look', 'Smells like real leather, feels supple and heavy. Got compliments on the first day wearing it.'],
    ['user_166', 5, 'Heavy-duty zippers and hardware', 'Zippers glide smoothly and the inner satin lining feels luxurious against sweaters.'],
    ['user_167', 4, 'Timeless biker style', 'Looks fantastic paired with jeans or boots for evening outings.']
  ],
  18: [ // Floral Summer Dress
    ['user_168', 5, 'Lightweight and flowy', 'Perfect breathable fabric for warm sunny beach days and summer weddings.'],
    ['user_169', 5, 'Vibrant print matches the pictures', 'The colors are bright and cheerful. Ruffle details add an elegant touch.'],
    ['user_170', 4, 'Flattering waist cinch', 'Adjustable tie at the waist accentuates natural curves comfortably.']
  ],
  19: [ // High-Waisted Leggings
    ['user_171', 5, '100% squat proof and non-sheer', 'Zero transparency during deep squats or yoga stretches. Stays firmly in place without rolling down.'],
    ['user_172', 5, 'Buttery soft compressive feel', 'Fabric feels like a second skin while providing gentle tummy support.'],
    ['user_173', 4, 'Side pockets hold iPhone easily', 'Deep side pockets keep your phone secure while running.'],
    ['user_174', 4, 'Moisture-wicking material dries fast', 'Keeps you cool during high-intensity gym workouts.']
  ],
  20: [ // Oversized Sweater
    ['user_175', 5, 'Incredibly soft and cozy knit', 'Super warm without feeling scratchy or itchy against bare skin.'],
    ['user_176', 4, 'Chic relaxed aesthetic', 'Drapes beautifully over leggings or slim jeans for an effortless fall look.'],
    ['user_177', 4, 'Chunky collar keeps neck warm', 'Great for chilly winter evenings with a hot cup of tea.']
  ],
  21: [ // Modern Sofa
    ['user_178', 5, 'Showstopper in the living room', 'The emerald velvet fabric is soft to touch and the mid-century silhouette looks high-end.'],
    ['user_179', 5, 'Comfortable high-density foam cushions', 'Firm yet supportive seating that does not sag after months of movie nights.'],
    ['user_180', 4, 'Easy assembly', 'Only had to screw on the solid wooden tapered legs; took less than 15 minutes.'],
    ['user_181', 3, 'Pet hair requires regular lint rolling', 'Velvet attracts pet fur, but cleans easily with a handheld vacuum brush.']
  ],
  22: [ // Oak Coffee Table
    ['user_182', 5, 'Solid wood with gorgeous grain', 'No cheap particle board here — heavy, authentic oak with a smooth satin protective coat.'],
    ['user_183', 4, 'Perfect height and surface area', 'Holds coffee mugs, books, and board games with room to spare.'],
    ['user_184', 5, 'Minimalist Scandinavian look', 'Complements both modern and traditional living room decor effortlessly.']
  ],
  23: [ // Ergonomic Office Chair
    ['user_185', 5, 'Saved my lower back', 'The dynamic lumbar support and adjustable headrest eliminated my workday back pain.'],
    ['user_186', 5, 'Breathable mesh keeps back cool', 'No sweaty back during long 8-hour remote workdays. Wheels glide quietly on hardwood.'],
    ['user_187', 4, '3D adjustable armrests', 'Armrests adjust up/down, forward/back, and pivot inward for comfortable typing.'],
    ['user_188', 3, 'Assembly takes about 30 minutes', 'Instructions were clear, but having a second person help align the backrest makes it faster.']
  ],
  24: [ // Standing Desk
    ['user_189', 5, 'Whisper-quiet dual motor lift', 'Transitions smoothly between sitting and standing heights in under 10 seconds.'],
    ['user_190', 5, 'Rock solid stability at full height', 'Zero monitor wobble while typing even at maximum elevation.'],
    ['user_191', 4, 'Preset memory buttons are super convenient', 'Programmed 4 height presets for sitting, standing, and walking pad treadmill.']
  ],
  25: [ // Table Lamp
    ['user_192', 5, 'Warm and calming ambient glow', 'Produces a gentle warm light that makes bedroom reading cozy without harsh glare.'],
    ['user_193', 4, 'Smooth touch dimming control', 'Tapping the metal base cycles through 3 brightness levels intuitively.'],
    ['user_194', 5, 'Compact footprint on bedside table', 'Minimalist aesthetic takes up very little space while looking like a designer piece.']
  ]
};

async function main() {
  console.log('🔄 Connecting to TiDB Cloud MySQL...');
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 4000,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false, minVersion: 'TLSv1.2' }
  });

  let insertedCount = 0;
  for (const [productId, reviews] of Object.entries(productReviews)) {
    for (const [userId, rating, title, body] of reviews) {
      try {
        await pool.query(
          `INSERT INTO reviews (product_id, user_id, rating, title, body)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE rating = VALUES(rating), title = VALUES(title), body = VALUES(body)`,
          [productId, userId, rating, title, body]
        );
        insertedCount++;
      } catch (err) {
        console.warn(`Warning on product ${productId}, user ${userId}:`, err.message);
      }
    }
  }

  console.log(`✅ Seeded/Updated ${insertedCount} reviews across all 25 products!`);

  const [summary] = await pool.query(`
    SELECT 
      COUNT(DISTINCT product_id) as products_with_reviews,
      COUNT(*) as total_reviews,
      ROUND(AVG(rating), 2) as overall_avg_rating
    FROM reviews
  `);
  console.log('📊 Verification Summary:', summary[0]);

  await pool.end();
}

main().catch(console.error);

