const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { SAMPLE_FAMILY_TREE } = require('./sampleData');

const isVercel = Boolean(process.env.VERCEL || process.env.NOW_REGION || process.env.AWS_LAMBDA_FUNCTION_NAME);
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
  console.warn('SQLite kutubxonasi yuklanmadi (Vercel Serverless rejimi):', err.message);
  useFallback = true;
}

// =========================================================
// FALLBACK FILE/MEMORY STORE (SERVERLESS CONTAINER SAFETY)
// =========================================================
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

// =========================================================
// UNIFIED DB INTERFACE
// =========================================================

function run(sql, params = []) {
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

function get(sql, params = []) {
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

function all(sql, params = []) {
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

// Fallback handlers
function runFallback(sql, params) {
  const norm = sql.trim().toUpperCase();
  if (norm.startsWith('CREATE') || norm.startsWith('DROP')) {
    return Promise.resolve({ id: 0, changes: 0 });
  }

  // INSERT INTO trees (tree_id, user_id, name, tree_data) VALUES (?, ?, ?, ?)
  if (norm.startsWith('INSERT INTO TREES')) {
    const newId = fallbackData.trees.length ? Math.max(...fallbackData.trees.map(t => t.id)) + 1 : 1;
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

  // UPDATE trees SET tree_data = ?, ... WHERE tree_id = ?
  if (norm.startsWith('UPDATE TREES')) {
    const treeId = params[params.length - 1];
    const tree = fallbackData.trees.find(t => t.tree_id === treeId);
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

  // INSERT INTO users
  if (norm.startsWith('INSERT INTO USERS')) {
    const newId = fallbackData.users.length ? Math.max(...fallbackData.users.map(u => u.id)) + 1 : 1;
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

  // SELECT * FROM trees WHERE tree_id = ?
  if (norm.includes('FROM TREES') && norm.includes('TREE_ID = ?')) {
    const t = fallbackData.trees.find(x => x.tree_id === params[0]);
    return Promise.resolve(t || null);
  }

  if (norm.includes('FROM TREES') && norm.includes('ID = ?')) {
    const t = fallbackData.trees.find(x => x.id === params[0]);
    return Promise.resolve(t || null);
  }

  // SELECT COUNT(*) as count FROM users
  if (norm.includes('COUNT(*) AS COUNT FROM USERS')) {
    return Promise.resolve({ count: fallbackData.users.length });
  }

  // SELECT id FROM users WHERE username = ?
  if (norm.includes('FROM USERS') && norm.includes('USERNAME = ?')) {
    const u = fallbackData.users.find(x => x.username.toLowerCase() === params[0].toLowerCase());
    return Promise.resolve(u || null);
  }

  if (norm.includes('FROM USERS') && norm.includes('ID = ?')) {
    const u = fallbackData.users.find(x => x.id === params[0]);
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

const GENERATION_PRESETS = [
  { level: 1, title: "1-avlod: O'zim / Farzandlar", relation: "self", desc: "Shajara egasi va uning avlodi" },
  { level: 2, title: "2-avlod: Ota-Ona", relation: "father", desc: "Ota va Ona (Padari buzrukvor va Volidai muhtarama)" },
  { level: 3, title: "3-avlod: Bobo va Buvi", relation: "grandfather", desc: "Katta ota va katta ona" },
  { level: 4, title: "4-avlod: Katta bobo", relation: "great_grandfather", desc: "Boboning otasi" },
  { level: 5, title: "5-avlod: Bobokalon", relation: "ancestor_5", desc: "5-ajdod" },
  { level: 6, title: "6-avlod: Pusht", relation: "ancestor_6", desc: "Pushti kamar, 6-ajdod" },
  { level: 7, title: "7-avlod: Urvoq / Arvoh", relation: "ancestor_7", desc: "Bosh poydevor ajdod" }
];

async function initDB() {
  if (useFallback || !db) {
    if (!fallbackData.trees.find(t => t.tree_id === 'default')) {
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

  await run(`
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

  await run(`
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

  await run(`CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_members_gen ON members(generation_level)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_members_parent ON members(parent_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_members_mother ON members(mother_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_members_spouse ON members(spouse_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);

  await run(`
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

  await run(`CREATE INDEX IF NOT EXISTS idx_trees_user ON trees(user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_trees_tree_id ON trees(tree_id)`);

  const userCount = await get(`SELECT COUNT(*) as count FROM users`);
  if (!userCount || userCount.count === 0) {
    console.log("Namunaviy ko'p bolali shajara kiritilmoqda (Ota-ona va ularning 4 bolasi)...");
    await seedDemoData();
  }

  const defaultTree = await get(`SELECT id FROM trees WHERE tree_id = 'default'`);
  if (!defaultTree) {
    console.log("Standart shajara daraxti (Normat ota va Saodat aya) bazaga kiritilmoqda...");
    await run(`
      INSERT INTO trees (tree_id, user_id, name, tree_data)
      VALUES ('default', 1, 'Normat ota Mirzayev oilasi shajarasi', ?)
    `, [JSON.stringify(SAMPLE_FAMILY_TREE)]);
  }
}

async function seedDemoData() {
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash("123456", salt);

  const user1 = await run(`
    INSERT INTO users (username, password_hash, full_name, bio, location, avatar, is_public)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `, [
    'anvar_qodirov',
    passwordHash,
    "Anvar Qodirov",
    "Toshkentlik dasturchi. Ota-onasi, aka-uka, opa-singillari va bobo-buvilari to'liq kiritilgan namunaviy shajara.",
    "Toshkent shahri, Chilonzor",
    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80"
  ]);

  console.log("Namunaviy foydalanuvchi muvaffaqiyatli yuklandi!");
}

module.exports = {
  db,
  run,
  get,
  all,
  initDB,
  GENERATION_PRESETS
};
