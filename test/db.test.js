const assert = require('assert');
const { convertSqlToPg, getActiveDbType, getDbInfo } = require('../db');

async function testDbLayer() {
  console.log('🧪 DB qatlami va SQL tarjimoni testlari boshlanmoqda...\n');

  // 1. convertSqlToPg tests
  const query1 = 'SELECT * FROM users WHERE username = ?';
  assert.strictEqual(convertSqlToPg(query1), 'SELECT * FROM users WHERE username = $1');
  console.log('✅ 1. Bitta parametrli query to\'g\'ri $1 ga aylantirildi.');

  const query2 = 'INSERT INTO users (username, password, name) VALUES (?, ?, ?)';
  assert.strictEqual(convertSqlToPg(query2), 'INSERT INTO users (username, password, name) VALUES ($1, $2, $3)');
  console.log('✅ 2. Ko\'p parametrli INSERT query to\'g\'ri $1, $2, $3 ga aylantirildi.');

  const query3 = 'SELECT * FROM users WHERE name LIKE ?';
  assert.strictEqual(convertSqlToPg(query3), 'SELECT * FROM users WHERE name ILIKE $1');
  console.log('✅ 3. LIKE operatori PostgreSQL uchun ILIKE ga to\'g\'ri o\'girildi.');

  // 2. getDbInfo test
  const defaultInfo = getDbInfo();
  assert(defaultInfo.type);
  assert(typeof defaultInfo.isRealDb === 'boolean');
  console.log('✅ 4. getDbInfo() ma\'lumoti:', defaultInfo.name);

  console.log('\n🎉 Barcha DB qatlami testlari muvaffaqiyatli yakunlandi!');
}

testDbLayer().catch((err) => {
  console.error('❌ Testda xatolik:', err);
  process.exit(1);
});
