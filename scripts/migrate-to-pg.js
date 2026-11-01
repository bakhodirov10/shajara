require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

async function migrate() {
  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRESQL_URL ||
    process.env.SUPABASE_DB_URL;

  if (!dbUrl) {
    console.error('\n❌ XATOLIK: .env faylida DATABASE_URL topilmadi!');
    console.error('Iltimos, avval .env fayliga haqiqiy PostgreSQL connection string kiriting:');
    console.error('DATABASE_URL=postgresql://neondb_owner:parol@ep-xyz.aws.neon.tech/neondb?sslmode=require\n');
    process.exit(1);
  }

  const sqlitePath = path.join(__dirname, '..', 'shajara.db');
  if (!fs.existsSync(sqlitePath)) {
    console.error(`\n❌ XATOLIK: SQLite fayli (${sqlitePath}) topilmadi!\n`);
    process.exit(1);
  }

  console.log('\n===============================================================');
  console.log('📦 SHAJARA.UZ: SQLite -> PostgreSQL ko\'chirish (Migration)');
  console.log('===============================================================');
  console.log(`📁 Manba: ${sqlitePath}`);
  const hostMatch = dbUrl.match(/@([^:/]+)/);
  console.log(`🐘 Manzil PostgreSQL: ${hostMatch ? hostMatch[1] : 'remote host'}\n`);

  let sqlite3;
  try {
    sqlite3 = require('sqlite3').verbose();
  } catch (err) {
    console.error('❌ sqlite3 kutubxonasini yuklab bo\'lmadi:', err.message);
    process.exit(1);
  }

  const sqliteDb = new sqlite3.Database(sqlitePath);
  const sqliteAll = (sql, params = []) =>
    new Promise((resolve, reject) => {
      sqliteDb.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });

  const isLocal = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: isLocal ? false : { rejectUnauthorized: false }
  });

  try {
    // 0. PostgreSQL bazasida jadvallarni initsializatsiya qilish
    const { initDB } = require('../db');
    await initDB();

    // 1. Users ko'chirish
    const users = await sqliteAll('SELECT * FROM users');
    console.log(`👤 1. Foydalanuvchilar (users) ko'chirilmoqda: ${users.length} ta...`);
    for (const u of users) {
      await pool.query(
        `
        INSERT INTO users (id, username, password_hash, full_name, bio, location, avatar, is_public, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          username = EXCLUDED.username,
          password_hash = EXCLUDED.password_hash,
          full_name = EXCLUDED.full_name,
          bio = EXCLUDED.bio,
          location = EXCLUDED.location,
          avatar = EXCLUDED.avatar
      `,
        [u.id, u.username, u.password_hash, u.full_name, u.bio, u.location, u.avatar, u.is_public, u.created_at]
      );
    }
    if (users.length > 0) {
      await pool.query("SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE(max(id), 1)) FROM users");
    }
    console.log('   ✅ Foydalanuvchilar muvaffaqiyatli saqlandi.');

    // 2. Members ko'chirish
    const members = await sqliteAll('SELECT * FROM members');
    console.log(`👥 2. Shajara a'zolari (members) ko'chirilmoqda: ${members.length} ta...`);
    for (const m of members) {
      await pool.query(
        `
        INSERT INTO members (
          id, user_id, first_name, last_name, patronymic, gender,
          generation_level, generation_title, relation_type,
          parent_id, mother_id, spouse_id,
          birth_year, death_year, is_alive, birth_place, profession, title_honor, bio, photo_url, notes, order_num, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
        )
        ON CONFLICT (id) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          generation_level = EXCLUDED.generation_level,
          updated_at = EXCLUDED.updated_at
      `,
        [
          m.id,
          m.user_id,
          m.first_name,
          m.last_name,
          m.patronymic,
          m.gender,
          m.generation_level,
          m.generation_title,
          m.relation_type,
          m.parent_id,
          m.mother_id,
          m.spouse_id,
          m.birth_year,
          m.death_year,
          m.is_alive,
          m.birth_place,
          m.profession,
          m.title_honor,
          m.bio,
          m.photo_url,
          m.notes,
          m.order_num,
          m.created_at,
          m.updated_at
        ]
      );
    }
    if (members.length > 0) {
      await pool.query("SELECT setval(pg_get_serial_sequence('members', 'id'), COALESCE(max(id), 1)) FROM members");
    }
    console.log("   ✅ Shajara a'zolari muvaffaqiyatli saqlandi.");

    // 3. Trees ko'chirish
    const trees = await sqliteAll('SELECT * FROM trees');
    console.log(`🌳 3. Shajara daraxtlari (trees) ko'chirilmoqda: ${trees.length} ta...`);
    for (const t of trees) {
      await pool.query(
        `
        INSERT INTO trees (id, tree_id, user_id, name, tree_data, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (tree_id) DO UPDATE SET
          name = EXCLUDED.name,
          tree_data = EXCLUDED.tree_data,
          updated_at = EXCLUDED.updated_at
      `,
        [t.id, t.tree_id, t.user_id, t.name, t.tree_data, t.created_at, t.updated_at]
      );
    }
    if (trees.length > 0) {
      await pool.query("SELECT setval(pg_get_serial_sequence('trees', 'id'), COALESCE(max(id), 1)) FROM trees");
    }
    console.log('   ✅ Shajara daraxtlari muvaffaqiyatli saqlandi.');

    console.log('\n===============================================================');
    console.log("🎉 TABRIKLAYMIZ! Barcha ma'lumotlar PostgreSQL ga to'liq ko'chirildi!");
    console.log('Endi sayt ma\'lumotlari hech qachon o\'chib ketmaydi!');
    console.log('===============================================================\n');
  } catch (err) {
    console.error('\n❌ Ko\'chirishda xatolik yuz berdi:', err);
    process.exit(1);
  } finally {
    sqliteDb.close();
    await pool.end();
  }
}

migrate();
