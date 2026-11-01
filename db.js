const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { SAMPLE_FAMILY_TREE } = require('./sampleData');

const isVercel = Boolean(
  process.env.VERCEL ||
  process.env.NOW_REGION ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.VERCEL_ENV
);

// =========================================================
// 1. ACTIVE DATABASE DRIVER DETECTION
// =========================================================

function getActiveDbType() {
  const pgUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRESQL_URL ||
    process.env.SUPABASE_DB_URL;

  if (pgUrl && (pgUrl.startsWith('postgres://') || pgUrl.startsWith('postgresql://'))) {
    return 'postgres';
  }

  const tursoUrl =
    process.env.TURSO_DATABASE_URL ||
    (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('libsql://')
      ? process.env.DATABASE_URL
      : null);

  if (tursoUrl) {
    return 'turso';
  }

  return 'sqlite';
}

function getDbInfo() {
  const type = getActiveDbType();
  if (type === 'postgres') {
    return {
      type: 'postgres',
      name: 'PostgreSQL (Doimiy Bulut Bazasi)',
      isRealDb: true,
      persistent: true,
      status: 'connected'
    };
  }
  if (type === 'turso') {
    return {
      type: 'turso',
      name: 'Turso LibSQL (Bulut Bazasi)',
      isRealDb: true,
      persistent: true,
      status: 'connected'
    };
  }
  return {
    type: 'sqlite',
    name: isVercel ? 'Vercel SQLite /tmp (Vaqtinchalik)' : 'SQLite (Lokal shajara.db)',
    isRealDb: false,
    persistent: !isVercel,
    status: isVercel ? 'warning_ephemeral' : 'connected',
    warning: isVercel
      ? "DIQQAT: Vercel serverless muhitida ma'lumotlar o'chib ketmasligi uchun DATABASE_URL (masalan: Neon yoki Supabase PostgreSQL) ni sozlang!"
      : null
  };
}

// =========================================================
// 2. POSTGRESQL (REAL PERSISTENT CLOUD DATABASE)
// =========================================================
let pgPool = null;

function getPgPool() {
  if (pgPool) return pgPool;

  const { Pool, types } = require('pg');
  // Return numbers instead of strings for int8 (bigint/count/sum)
  types.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10)));
  types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));

  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRESQL_URL ||
    process.env.SUPABASE_DB_URL;

  const isLocal = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');

  pgPool = new Pool({
    connectionString: dbUrl,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  pgPool.on('error', (err) => {
    console.error('PostgreSQL kutilmagan ulanish xatosi:', err.message);
  });

  return pgPool;
}

function convertSqlToPg(sql) {
  let index = 1;
  let pgSql = sql.replace(/\?/g, () => `$${index++}`);
  // Case-insensitive matching for ILIKE in Postgres
  pgSql = pgSql.replace(/\bLIKE\b/gi, 'ILIKE');
  return pgSql;
}

async function runPg(sql, params = []) {
  const pool = getPgPool();
  let cleanSql = sql.trim().replace(/;+$/, '');
  let pgSql = convertSqlToPg(cleanSql);
  const isInsert = /^\s*INSERT\s+INTO/i.test(pgSql);

  if (isInsert && !/RETURNING/i.test(pgSql)) {
    pgSql += ' RETURNING id';
  }

  const res = await pool.query(pgSql, params);
  const lastId = isInsert && res.rows && res.rows[0] ? res.rows[0].id : null;
  return {
    id: lastId,
    changes: res.rowCount || 0
  };
}

async function getPg(sql, params = []) {
  const pool = getPgPool();
  let cleanSql = sql.trim().replace(/;+$/, '');
  const pgSql = convertSqlToPg(cleanSql);
  const res = await pool.query(pgSql, params);
  return res.rows && res.rows[0] ? res.rows[0] : null;
}

async function allPg(sql, params = []) {
  const pool = getPgPool();
  let cleanSql = sql.trim().replace(/;+$/, '');
  const pgSql = convertSqlToPg(cleanSql);
  const res = await pool.query(pgSql, params);
  return res.rows || [];
}

async function initPgDB() {
  const pool = getPgPool();
  console.log('🐘 PostgreSQL (Real Database) ulanishi tekshirilmoqda...');
  await pool.query('SELECT 1');
  console.log('✅ PostgreSQL bazasiga muvaffaqiyatli ulandi!');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      bio TEXT,
      location VARCHAR(255),
      avatar TEXT,
      is_public INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS members (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      first_name VARCHAR(255) NOT NULL,
      last_name VARCHAR(255),
      patronymic VARCHAR(255),
      gender VARCHAR(50) DEFAULT 'male',
      generation_level INTEGER NOT NULL,
      generation_title VARCHAR(255),
      relation_type VARCHAR(50) DEFAULT 'father',
      parent_id INTEGER,
      mother_id INTEGER,
      spouse_id INTEGER,
      birth_year VARCHAR(50),
      death_year VARCHAR(50),
      is_alive INTEGER DEFAULT 1,
      birth_place VARCHAR(255),
      profession VARCHAR(255),
      title_honor VARCHAR(255),
      bio TEXT,
      photo_url TEXT,
      notes TEXT,
      order_num INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_members_gen ON members(generation_level)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_members_parent ON members(parent_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_members_mother ON members(mother_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_members_spouse ON members(spouse_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS trees (
      id SERIAL PRIMARY KEY,
      tree_id VARCHAR(255) UNIQUE NOT NULL,
      user_id INTEGER,
      name VARCHAR(255) NOT NULL,
      tree_data TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_trees_user ON trees(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_trees_tree_id ON trees(tree_id)`);

  // Namunaviy foydalanuvchini tekshirish
  const userCount = await getPg(`SELECT COUNT(*) as count FROM users`);
  if (!userCount || Number(userCount.count) === 0) {
    console.log("PostgreSQL: Namunaviy foydalanuvchi kiritilmoqda (anvar_qodirov)...");
    await seedDemoData();
  }

  // Standart shajarani tekshirish
  const defaultTree = await getPg(`SELECT id FROM trees WHERE tree_id = 'default'`);
  if (!defaultTree) {
    console.log("PostgreSQL: Standart shajara daraxti (Normat ota) kiritilmoqda...");
    const demoUser = await getPg(`SELECT id FROM users LIMIT 1`);
    const demoUserId = demoUser ? demoUser.id : null;
    await runPg(
      `
      INSERT INTO trees (tree_id, user_id, name, tree_data)
      VALUES ($1, $2, $3, $4)
    `,
      ['default', demoUserId, 'Normat ota Mirzayev oilasi shajarasi', JSON.stringify(SAMPLE_FAMILY_TREE)]
    );
  }
}

// =========================================================
// 3. TURSO / LIBSQL (SERVERLESS CLOUD SQLITE)
// =========================================================
let tursoClient = null;

function getTursoClient() {
  if (tursoClient) return tursoClient;
  const { createClient } = require('@libsql/client');
  const url =
    process.env.TURSO_DATABASE_URL ||
    (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('libsql://')
      ? process.env.DATABASE_URL
      : null);

  tursoClient = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN
  });
  return tursoClient;
}

async function runTurso(sql, params = []) {
  const client = getTursoClient();
  const res = await client.execute({ sql, args: params });
  return {
    id: res.lastInsertRowid !== undefined && res.lastInsertRowid !== null ? Number(res.lastInsertRowid) : null,
    changes: res.rowsAffected || 0
  };
}

async function getTurso(sql, params = []) {
  const client = getTursoClient();
  const res = await client.execute({ sql, args: params });
  return res.rows && res.rows[0] ? res.rows[0] : null;
}

async function allTurso(sql, params = []) {
  const client = getTursoClient();
  const res = await client.execute({ sql, args: params });
  return res.rows || [];
}

async function initTursoDB() {
  console.log('⚡ Turso LibSQL bulut bazasiga ulanmoqda...');
  await runTurso(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      bio TEXT,
      location TEXT,
      avatar TEXT,
      is_public INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await runTurso(`
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT,
      patronymic TEXT,
      gender TEXT DEFAULT 'male',
      generation_level INTEGER NOT NULL,
      generation_title TEXT,
      relation_type TEXT DEFAULT 'father',
      parent_id INTEGER,
      mother_id INTEGER,
      spouse_id INTEGER,
      birth_year TEXT,
      death_year TEXT,
      is_alive INTEGER DEFAULT 1,
      birth_place TEXT,
      profession TEXT,
      title_honor TEXT,
      bio TEXT,
      photo_url TEXT,
      notes TEXT,
      order_num INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await runTurso(`CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id)`);
  await runTurso(`CREATE INDEX IF NOT EXISTS idx_members_gen ON members(generation_level)`);
  await runTurso(`CREATE INDEX IF NOT EXISTS idx_members_parent ON members(parent_id)`);
  await runTurso(`CREATE INDEX IF NOT EXISTS idx_members_mother ON members(mother_id)`);
  await runTurso(`CREATE INDEX IF NOT EXISTS idx_members_spouse ON members(spouse_id)`);
  await runTurso(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);

  await runTurso(`
    CREATE TABLE IF NOT EXISTS trees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tree_id TEXT UNIQUE NOT NULL,
      user_id INTEGER,
      name TEXT NOT NULL,
      tree_data TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await runTurso(`CREATE INDEX IF NOT EXISTS idx_trees_user ON trees(user_id)`);
  await runTurso(`CREATE INDEX IF NOT EXISTS idx_trees_tree_id ON trees(tree_id)`);

  const userCount = await getTurso(`SELECT COUNT(*) as count FROM users`);
  if (!userCount || Number(userCount.count) === 0) {
    console.log("Turso: Namunaviy foydalanuvchi kiritilmoqda...");
    await seedDemoData();
  }

  const defaultTree = await getTurso(`SELECT id FROM trees WHERE tree_id = 'default'`);
  if (!defaultTree) {
    console.log("Turso: Standart shajara daraxti kiritilmoqda...");
    await runTurso(
      `
      INSERT INTO trees (tree_id, user_id, name, tree_data)
      VALUES ('default', 1, 'Normat ota Mirzayev oilasi shajarasi', ?)
    `,
      [JSON.stringify(SAMPLE_FAMILY_TREE)]
    );
  }
}

// =========================================================
// 4. SQLITE (LOCAL / FALLBACK ENVIRONMENT)
// =========================================================
let DB_PATH = path.join(__dirname, 'shajara.db');

if (isVercel) {
  const tmpDbPath = path.join('/tmp', 'shajara.db');
  if (!fs.existsSync(tmpDbPath)) {
    try {
      if (fs.existsSync(DB_PATH)) {
        fs.copyFileSync(DB_PATH, tmpDbPath);
      }
    } catch (e) {
      console.warn('DB copy to /tmp error:', e);
    }
  }
  DB_PATH = tmpDbPath;
}

let sqlite3 = null;
let db = null;
let useFallback = false;

function initSqliteConnection() {
  if (db || useFallback) return;
  try {
    sqlite3 = require('sqlite3').verbose();
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.warn('SQLite ulanishda xatolik:', err.message);
        useFallback = true;
      } else {
        console.log('SQLite bazasiga muvaffaqiyatli ulandi:', DB_PATH);
      }
    });
  } catch (err) {
    console.warn('SQLite yuklanmadi (Fallback xotiraga o\'tilmoqda):', err.message);
    useFallback = true;
  }
}

// Memory / File fallback for serverless without sqlite binary
const FALLBACK_PATH = isVercel ? '/tmp/shajara_data.json' : path.join(__dirname, 'shajara_data.json');

function loadFallbackData() {
  try {
    if (fs.existsSync(FALLBACK_PATH)) {
      const content = fs.readFileSync(FALLBACK_PATH, 'utf8');
      return JSON.parse(content);
    }
  } catch (e) {}
  return {
    users: [],
    members: [],
    trees: [
      {
        id: 1,
        tree_id: 'default',
        user_id: 1,
        name: 'Normat ota Mirzayev oilasi shajarasi',
        tree_data: JSON.stringify(SAMPLE_FAMILY_TREE),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ]
  };
}

let fallbackData = loadFallbackData();

function saveFallbackData() {
  try {
    fs.writeFileSync(FALLBACK_PATH, JSON.stringify(fallbackData, null, 2), 'utf8');
  } catch (e) {
    console.warn('Fallback save error:', e.message);
  }
}

function runFallback(sql, params) {
  const norm = sql.trim().toUpperCase();
  if (norm.startsWith('CREATE') || norm.startsWith('DROP')) {
    return Promise.resolve({ id: 0, changes: 0 });
  }

  if (norm.startsWith('INSERT INTO TREES')) {
    const newId = fallbackData.trees.length ? Math.max(...fallbackData.trees.map((t) => t.id)) + 1 : 1;
    const newTree = {
      id: newId,
      tree_id: params[0],
      user_id: params[1],
      name: params[2],
      tree_data: params[3],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    fallbackData.trees.push(newTree);
    saveFallbackData();
    return Promise.resolve({ id: newId, changes: 1 });
  }

  if (norm.startsWith('UPDATE TREES')) {
    const treeId = params[params.length - 1];
    const tree = fallbackData.trees.find((t) => t.tree_id === treeId);
    if (tree) {
      tree.tree_data = params[0];
      if (params.length > 2 && params[1]) {
        tree.name = params[1];
      }
      tree.updated_at = new Date().toISOString();
      saveFallbackData();
      return Promise.resolve({ id: tree.id, changes: 1 });
    }
    return Promise.resolve({ id: 0, changes: 0 });
  }

  if (norm.startsWith('INSERT INTO USERS')) {
    const newId = fallbackData.users.length ? Math.max(...fallbackData.users.map((u) => u.id)) + 1 : 1;
    const user = {
      id: newId,
      username: params[0],
      password_hash: params[1],
      full_name: params[2],
      bio: params[3] || '',
      location: params[4] || '',
      avatar: params[5] || '',
      is_public: 1,
      created_at: new Date().toISOString()
    };
    fallbackData.users.push(user);
    saveFallbackData();
    return Promise.resolve({ id: newId, changes: 1 });
  }

  return Promise.resolve({ id: 1, changes: 1 });
}

function getFallback(sql, params) {
  const norm = sql.trim().toUpperCase();

  if (norm.includes('FROM TREES') && norm.includes('TREE_ID = ?')) {
    const t = fallbackData.trees.find((x) => x.tree_id === params[0]);
    return Promise.resolve(t || null);
  }

  if (norm.includes('FROM TREES') && norm.includes('ID = ?')) {
    const t = fallbackData.trees.find((x) => x.id === params[0]);
    return Promise.resolve(t || null);
  }

  if (norm.includes('COUNT(*) AS COUNT FROM USERS')) {
    return Promise.resolve({ count: fallbackData.users.length });
  }

  if (norm.includes('FROM USERS') && norm.includes('USERNAME = ?')) {
    const u = fallbackData.users.find((x) => x.username.toLowerCase() === params[0].toLowerCase());
    return Promise.resolve(u || null);
  }

  if (norm.includes('FROM USERS') && norm.includes('ID = ?')) {
    const u = fallbackData.users.find((x) => x.id === params[0]);
    return Promise.resolve(u || null);
  }

  return Promise.resolve(null);
}

function allFallback(sql, params) {
  const norm = sql.trim().toUpperCase();
  if (norm.includes('FROM USERS')) {
    return Promise.resolve(fallbackData.users);
  }
  if (norm.includes('FROM MEMBERS')) {
    return Promise.resolve(fallbackData.members);
  }
  if (norm.includes('FROM TREES')) {
    return Promise.resolve(fallbackData.trees);
  }
  return Promise.resolve([]);
}

function runSqlite(sql, params = []) {
  initSqliteConnection();
  if (useFallback || !db) {
    return runFallback(sql, params);
  }
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function getSqlite(sql, params = []) {
  initSqliteConnection();
  if (useFallback || !db) {
    return getFallback(sql, params);
  }
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function allSqlite(sql, params = []) {
  initSqliteConnection();
  if (useFallback || !db) {
    return allFallback(sql, params);
  }
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function initSqliteDB() {
  initSqliteConnection();

  if (isVercel) {
    console.warn("==================================================================");
    console.warn("⚠️  DIQQAT: Vercel serverless muhitida DATABASE_URL aniqlanmadi!");
    console.warn("⚠️  SQLite va /tmp vaqtinchalik bo'lib, har 10-15 daqiqada o'chib ketadi.");
    console.warn("⚠️  Ma'lumotlar saqlanib qolishi uchun Vercel Environment Variables ga");
    console.warn("⚠️  DATABASE_URL (Neon yoki Supabase PostgreSQL) ni qo'shing!");
    console.warn("==================================================================");
  }

  if (useFallback || !db) {
    if (!fallbackData.trees.find((t) => t.tree_id === 'default')) {
      fallbackData.trees.push({
        id: 1,
        tree_id: 'default',
        user_id: 1,
        name: 'Normat ota Mirzayev oilasi shajarasi',
        tree_data: JSON.stringify(SAMPLE_FAMILY_TREE),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      saveFallbackData();
    }
    return;
  }

  await runSqlite(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      bio TEXT,
      location TEXT,
      avatar TEXT,
      is_public INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await runSqlite(`
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT,
      patronymic TEXT,
      gender TEXT DEFAULT 'male',
      generation_level INTEGER NOT NULL,
      generation_title TEXT,
      relation_type TEXT DEFAULT 'father',
      parent_id INTEGER,
      mother_id INTEGER,
      spouse_id INTEGER,
      birth_year TEXT,
      death_year TEXT,
      is_alive INTEGER DEFAULT 1,
      birth_place TEXT,
      profession TEXT,
      title_honor TEXT,
      bio TEXT,
      photo_url TEXT,
      notes TEXT,
      order_num INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await runSqlite(`CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id)`);
  await runSqlite(`CREATE INDEX IF NOT EXISTS idx_members_gen ON members(generation_level)`);
  await runSqlite(`CREATE INDEX IF NOT EXISTS idx_members_parent ON members(parent_id)`);
  await runSqlite(`CREATE INDEX IF NOT EXISTS idx_members_mother ON members(mother_id)`);
  await runSqlite(`CREATE INDEX IF NOT EXISTS idx_members_spouse ON members(spouse_id)`);
  await runSqlite(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);

  await runSqlite(`
    CREATE TABLE IF NOT EXISTS trees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tree_id TEXT UNIQUE NOT NULL,
      user_id INTEGER,
      name TEXT NOT NULL,
      tree_data TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await runSqlite(`CREATE INDEX IF NOT EXISTS idx_trees_user ON trees(user_id)`);
  await runSqlite(`CREATE INDEX IF NOT EXISTS idx_trees_tree_id ON trees(tree_id)`);

  const userCount = await getSqlite(`SELECT COUNT(*) as count FROM users`);
  if (!userCount || Number(userCount.count) === 0) {
    console.log("Namunaviy ko'p bolali shajara kiritilmoqda (Ota-ona va ularning 4 bolasi)...");
    await seedDemoData();
  }

  const defaultTree = await getSqlite(`SELECT id FROM trees WHERE tree_id = 'default'`);
  if (!defaultTree) {
    console.log("Standart shajara daraxti (Normat ota va Saodat aya) bazaga kiritilmoqda...");
    await runSqlite(
      `
      INSERT INTO trees (tree_id, user_id, name, tree_data)
      VALUES ('default', 1, 'Normat ota Mirzayev oilasi shajarasi', ?)
    `,
      [JSON.stringify(SAMPLE_FAMILY_TREE)]
    );
  }
}

// =========================================================
// 5. UNIFIED DISPATCH INTERFACE
// =========================================================

function run(sql, params = []) {
  const type = getActiveDbType();
  if (type === 'postgres') return runPg(sql, params);
  if (type === 'turso') return runTurso(sql, params);
  return runSqlite(sql, params);
}

function get(sql, params = []) {
  const type = getActiveDbType();
  if (type === 'postgres') return getPg(sql, params);
  if (type === 'turso') return getTurso(sql, params);
  return getSqlite(sql, params);
}

function all(sql, params = []) {
  const type = getActiveDbType();
  if (type === 'postgres') return allPg(sql, params);
  if (type === 'turso') return allTurso(sql, params);
  return allSqlite(sql, params);
}

async function initDB() {
  const type = getActiveDbType();
  if (type === 'postgres') return initPgDB();
  if (type === 'turso') return initTursoDB();
  return initSqliteDB();
}

async function seedDemoData() {
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('123456', salt);

  await run(
    `
    INSERT INTO users (username, password_hash, full_name, bio, location, avatar, is_public)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `,
    [
      'anvar_qodirov',
      passwordHash,
      'Anvar Qodirov',
      "Toshkentlik dasturchi. Ota-onasi, aka-uka, opa-singillari va bobo-buvilari to'liq kiritilgan namunaviy shajara.",
      'Toshkent shahri, Chilonzor',
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'
    ]
  );

  console.log('Namunaviy foydalanuvchi muvaffaqiyatli yuklandi!');
}

async function closeDB() {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
  if (tursoClient) {
    tursoClient = null;
  }
  if (db) {
    await new Promise((res) => db.close(res));
    db = null;
  }
}

const GENERATION_PRESETS = [
  { level: 1, title: "1-avlod: O'zim / Farzandlar", relation: 'self', desc: 'Shajara egasi va uning avlodi' },
  { level: 2, title: '2-avlod: Ota-Ona', relation: 'father', desc: 'Ota va Ona (Padari buzrukvor va Volidai muhtarama)' },
  { level: 3, title: '3-avlod: Bobo va Buvi', relation: 'grandfather', desc: 'Katta ota va katta ona' },
  { level: 4, title: '4-avlod: Katta bobo', relation: 'great_grandfather', desc: 'Boboning otasi' },
  { level: 5, title: '5-avlod: Bobokalon', relation: 'ancestor_5', desc: '5-ajdod' },
  { level: 6, title: '6-avlod: Pusht', relation: 'ancestor_6', desc: 'Pushti kamar, 6-ajdod' },
  { level: 7, title: '7-avlod: Urvoq / Arvoh', relation: 'ancestor_7', desc: 'Bosh poydevor ajdod' }
];

module.exports = {
  db,
  run,
  get,
  all,
  initDB,
  getDbInfo,
  getActiveDbType,
  closeDB,
  convertSqlToPg,
  GENERATION_PRESETS
};
