const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const { SAMPLE_FAMILY_TREE } = require('./sampleData');

const DB_PATH = path.join(__dirname, 'shajara.db');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('SQLite ma\'lumotlar bazasiga ulanishda xatolik:', err.message);
  } else {
    console.log('SQLite bazasiga muvaffaqiyatli ulandi:', DB_PATH);
  }
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
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

  // Shajara daraxti strukturasi jadvali (Hierarchical JSON + Metadata)
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
  if (userCount.count === 0) {
    console.log("Namunaviy ko'p bolali shajara kiritilmoqda (Ota-ona va ularning 4 bolasi)...");
    await seedDemoData();
  }

  // Standart umumiy shajara (Default Tree) mavjudligini tekshirish
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

  // 1. Foydalanuvchi: Anvar Qodirov
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

  const uid1 = user1.id;

  // 7-avlod: Urvoq / Arvoh
  const gen7 = await run(`
    INSERT INTO members (user_id, first_name, last_name, gender, generation_level, generation_title, relation_type, birth_year, death_year, is_alive, birth_place, profession, title_honor, bio)
    VALUES (?, 'Yoqubbek', 'Sarkarda', 'male', 7, '7-avlod: Urvoq / Arvoh', 'ancestor_7', '1810', '1875', 0, 'Kattaqo''rg''on', 'Harbiy sarkarda', 'Bek / Sarkarda', 'Sulolaning muqaddas 7-avlod poydevori.')
  `, [uid1]);

  // 6-avlod: Pusht
  const gen6 = await run(`
    INSERT INTO members (user_id, first_name, last_name, gender, generation_level, generation_title, relation_type, parent_id, birth_year, death_year, is_alive, birth_place, profession, title_honor, bio)
    VALUES (?, 'Rustam', 'Yoqubbekov', 'male', 6, '6-avlod: Pusht', 'ancestor_6', ?, '1845', '1918', 0, 'Buxoro amirligi', 'Ipak savdogari', 'Karvonboshi', 'Buyuk Ipak yo''lida ipak va matolar savdosi bilan shug''ullangan.')
  `, [uid1, gen7.id]);

  // 5-avlod: Bobokalon
  const gen5 = await run(`
    INSERT INTO members (user_id, first_name, last_name, gender, generation_level, generation_title, relation_type, parent_id, birth_year, death_year, is_alive, birth_place, profession, title_honor, bio)
    VALUES (?, 'Mirza', 'Rustamov', 'male', 5, '5-avlod: Bobokalon', 'ancestor_5', ?, '1880', '1955', 0, 'Samarqand', 'Sharqshunos xattot', 'Mirzo', 'Sharq qo''lyozmalarini ko''chirgan xattot va ma''rifatparvar.')
  `, [uid1, gen6.id]);

  // 4-avlod: Katta bobo
  const gen4 = await run(`
    INSERT INTO members (user_id, first_name, last_name, gender, generation_level, generation_title, relation_type, parent_id, birth_year, death_year, is_alive, birth_place, profession, title_honor, bio)
    VALUES (?, 'Normat', 'Mirzayev', 'male', 4, '4-avlod: Katta bobo', 'great_grandfather', ?, '1912', '1982', 0, 'Samarqand', 'Bog''bon va dehqon', 'El oqsoqoli', 'Mashhur Samarqand mevali bog''larini barpo etgan mirishkor.')
  `, [uid1, gen5.id]);

  // 3-avlod: Bobo va Buvi
  const bobo = await run(`
    INSERT INTO members (user_id, first_name, last_name, patronymic, gender, generation_level, generation_title, relation_type, parent_id, birth_year, death_year, is_alive, birth_place, profession, title_honor, bio, photo_url)
    VALUES (?, 'Qodir', 'Normatov', 'Normat o''g''li', 'male', 3, '3-avlod: Bobo', 'grandfather', ?, '1940', '2015', 0, 'Samarqand, Payariq', 'Matematika o''qituvchisi', 'Xalq ta''limi a''lochisi', '45 yil yoshlarga ta''lim bergan fidoyi ustoz.', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=400&q=80')
  `, [uid1, gen4.id]);

  const buvi = await run(`
    INSERT INTO members (user_id, first_name, last_name, gender, generation_level, generation_title, relation_type, spouse_id, birth_year, death_year, is_alive, birth_place, profession, title_honor, bio, photo_url)
    VALUES (?, 'Saodat', 'Normatova', 'female', 3, '3-avlod: Buvi', 'grandmother', ?, '1945', '2018', 0, 'Samarqand', 'Hamshira', 'Mehribon buvi', 'Katta oilaning mehribon bekasi, farzandlar va nabiralar tarbiyachisi.', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80')
  `, [uid1, bobo.id]);

  await run(`UPDATE members SET spouse_id = ? WHERE id = ?`, [buvi.id, bobo.id]);

  // Bobo va Buvining bolalari (3 ta bola: Alisher, Botir, Gulchehra)
  // 1-bola: Alisher (Ota)
  const ota = await run(`
    INSERT INTO members (user_id, first_name, last_name, patronymic, gender, generation_level, generation_title, relation_type, parent_id, mother_id, birth_year, is_alive, birth_place, profession, title_honor, bio, photo_url)
    VALUES (?, 'Alisher', 'Qodirov', 'Qodir o''g''li', 'male', 2, '2-avlod: Ota', 'father', ?, ?, '1968', 1, 'Toshkent viloyati, Zangiota', 'Quruvchi muhandis, usta', 'Usta me''mor', 'Ko''plab turar-joylar qurilishida ishtirok etgan, oila boshlig''i.', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80')
  `, [uid1, bobo.id, buvi.id]);

  // 2-bola: Botir (Amaki)
  await run(`
    INSERT INTO members (user_id, first_name, last_name, patronymic, gender, generation_level, generation_title, relation_type, parent_id, mother_id, birth_year, is_alive, birth_place, profession, title_honor, bio, photo_url)
    VALUES (?, 'Botir', 'Normatov', 'Qodir o''g''li', 'male', 2, 'Amaki', 'uncle', ?, ?, '1971', 1, 'Samarqand', 'Shifokor-jarroh', 'Oliy toifali shifokor', 'Tibbiyot sohasida ko''p yillik tajribaga ega jarroh.', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80')
  `, [uid1, bobo.id, buvi.id]);

  // 3-bola: Gulchehra (Amma)
  await run(`
    INSERT INTO members (user_id, first_name, last_name, patronymic, gender, generation_level, generation_title, relation_type, parent_id, mother_id, birth_year, is_alive, birth_place, profession, title_honor, bio, photo_url)
    VALUES (?, 'Gulchehra', 'Normatova', 'Qodir qizi', 'female', 2, 'Amma', 'aunt', ?, ?, '1975', 1, 'Samarqand', 'Tilshunos o''qituvchi', 'Muallima', 'Maktabda ona tili va adabiyot fanidan dars beradi.', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80')
  `, [uid1, bobo.id, buvi.id]);

  // Ona: Nodirabegim (Alisherning rafiqasi)
  const ona = await run(`
    INSERT INTO members (user_id, first_name, last_name, gender, generation_level, generation_title, relation_type, spouse_id, birth_year, is_alive, birth_place, profession, title_honor, bio, photo_url)
    VALUES (?, 'Nodirabegim', 'Qodirova', 'female', 2, '2-avlod: Ona', 'mother', ?, '1972', 1, 'Toshkent shahri', 'Oliy toifali o''qituvchi', 'Muhtarama ona', '4 nafar farzandning mehribon onasi, oila fayzi.', 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?auto=format&fit=crop&w=400&q=80')
  `, [uid1, ota.id]);

  await run(`UPDATE members SET spouse_id = ? WHERE id = ?`, [ona.id, ota.id]);

  // =========================================================================
  // Ota (Alisher) va Ona (Nodira) ning 4 ta bolasi (User talabi bo'yicha!):
  // 1-bola: Anvar (O'zim / 1-farzand)
  // 2-bola: Sardor (Uka / 2-farzand)
  // 3-bola: Madina (Singil / 3-farzand)
  // 4-bola: Jasur (Kichik uka / 4-farzand)
  // =========================================================================

  const anvar = await run(`
    INSERT INTO members (user_id, first_name, last_name, patronymic, gender, generation_level, generation_title, relation_type, parent_id, mother_id, birth_year, is_alive, birth_place, profession, title_honor, bio, photo_url)
    VALUES (?, 'Anvar', 'Qodirov', 'Alisher o''g''li', 'male', 1, '1-farzand (O''zim)', 'self', ?, ?, '1996', 1, 'Toshkent shahri', 'Dasturiy ta''minot muhandisi', 'Muhandis', 'Katta o''g''il, IT sohasida faoliyat yuritadi.', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80')
  `, [uid1, ota.id, ona.id]);

  const sardor = await run(`
    INSERT INTO members (user_id, first_name, last_name, patronymic, gender, generation_level, generation_title, relation_type, parent_id, mother_id, birth_year, is_alive, birth_place, profession, title_honor, bio, photo_url)
    VALUES (?, 'Sardor', 'Qodirov', 'Alisher o''g''li', 'male', 1, '2-farzand (Uka)', 'child', ?, ?, '1999', 1, 'Toshkent shahri', 'Qurilish muhandisi', 'Muhandis', 'Otasi kabi qurilish sohasida faoliyat olib boradi.', 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=400&q=80')
  `, [uid1, ota.id, ona.id]);

  const madina = await run(`
    INSERT INTO members (user_id, first_name, last_name, patronymic, gender, generation_level, generation_title, relation_type, parent_id, mother_id, birth_year, is_alive, birth_place, profession, title_honor, bio, photo_url)
    VALUES (?, 'Madina', 'Qodirova', 'Alisher qizi', 'female', 1, '3-farzand (Singil)', 'child', ?, ?, '2002', 1, 'Toshkent shahri', 'Shifokor-pediatr', 'Shifokor', 'Toshkent Tibbiyot Akademiyasi bitiruvchisi.', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80')
  `, [uid1, ota.id, ona.id]);

  const jasur = await run(`
    INSERT INTO members (user_id, first_name, last_name, patronymic, gender, generation_level, generation_title, relation_type, parent_id, mother_id, birth_year, is_alive, birth_place, profession, title_honor, bio, photo_url)
    VALUES (?, 'Jasur', 'Qodirov', 'Alisher o''g''li', 'male', 1, '4-farzand (Kichik uka)', 'child', ?, ?, '2006', 1, 'Toshkent shahri', 'Talaba', 'Talaba', 'Universitet talabasi, xorijiy tillarni o''rganadi.', 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=400&q=80')
  `, [uid1, ota.id, ona.id]);

  // Anvarning oilasi (Turmush o'rtog'i va 2 nafar bolasi)
  const shahlo = await run(`
    INSERT INTO members (user_id, first_name, last_name, gender, generation_level, generation_title, relation_type, spouse_id, birth_year, is_alive, birth_place, profession, bio, photo_url)
    VALUES (?, 'Shahlo', 'Qodirova', 'female', 1, 'Turmush o''rtog''i', 'spouse', ?, '1998', 1, 'Toshkent shahri', 'Grafik dizayner', 'Anvarning suyukli rafiqasi.', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80')
  `, [uid1, anvar.id]);

  await run(`UPDATE members SET spouse_id = ? WHERE id = ?`, [shahlo.id, anvar.id]);

  // Anvar va Shahloning bolalari (Nabiralar)
  await run(`
    INSERT INTO members (user_id, first_name, last_name, patronymic, gender, generation_level, generation_title, relation_type, parent_id, mother_id, birth_year, is_alive, birth_place, bio)
    VALUES (?, 'Bobur', 'Qodirov', 'Anvar o''g''li', 'male', 0, 'Nabira (O''g''il)', 'child', ?, ?, '2021', 1, 'Toshkent shahri', 'Sulolaning yosh davomchisi.')
  `, [uid1, anvar.id, shahlo.id]);

  await run(`
    INSERT INTO members (user_id, first_name, last_name, patronymic, gender, generation_level, generation_title, relation_type, parent_id, mother_id, birth_year, is_alive, birth_place, bio)
    VALUES (?, 'Nilufar', 'Qodirova', 'Anvar qizi', 'female', 0, 'Nabira (Qiz)', 'child', ?, ?, '2024', 1, 'Toshkent shahri', 'Kichik qizaloq.')
  `, [uid1, anvar.id, shahlo.id]);

  console.log("Namunaviy ko'p bolali shajara muvaffaqiyatli yuklandi!");
}

module.exports = {
  db,
  run,
  get,
  all,
  initDB,
  GENERATION_PRESETS
};
