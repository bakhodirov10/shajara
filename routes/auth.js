const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { get, run, all } = require('../db');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');

// Ro'yxatdan o'tish (Register)
router.post('/register', async (req, res) => {
  try {
    const { username, password, full_name, location, bio } = req.body;

    if (!username || !password || !full_name) {
      return res.status(400).json({
        success: false,
        message: 'Foydalanuvchi nomi (username), parol va to\'liq ism kiritilishi shart!'
      });
    }

    const cleanUsername = username.trim().toLowerCase();
    if (cleanUsername.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Foydalanuvchi nomi kamida 3 ta belgidan iborat bo\'lishi kerak.'
      });
    }

    if (password.length < 5) {
      return res.status(400).json({
        success: false,
        message: 'Parol kamida 5 ta belgidan iborat bo\'lishi kerak.'
      });
    }

    const existingUser = await get(`SELECT id FROM users WHERE username = ?`, [cleanUsername]);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Ushbu foydalanuvchi nomi (username) allaqachon band. Boshqa nom tanlang.'
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const result = await run(`
      INSERT INTO users (username, password_hash, full_name, bio, location, is_public)
      VALUES (?, ?, ?, ?, ?, 1)
    `, [
      cleanUsername,
      passwordHash,
      full_name.trim(),
      bio ? bio.trim() : "Mening 7 avlod shajaram",
      location ? location.trim() : "O'zbekiston"
    ]);

    const newUserId = result.id;

    // Foydalanuvchining o'zini avtomatik 1-avlod qilib qo'shish
    const nameParts = full_name.trim().split(' ');
    const firstName = nameParts[0] || 'O\'zim';
    const lastName = nameParts.slice(1).join(' ') || '';

    await run(`
      INSERT INTO members (
        user_id, first_name, last_name, gender,
        generation_level, generation_title, relation_type,
        is_alive, birth_place, profession, bio
      ) VALUES (?, ?, ?, 'male', 1, '1-avlod: O''zim', 'self', 1, ?, 'Tadbirkor / Mutaxassis', 'Shajara asoschisi va nasl davomchisi.')
    `, [
      newUserId,
      firstName,
      lastName,
      location || "O'zbekiston"
    ]);

    const token = jwt.sign(
      { id: newUserId, username: cleanUsername },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    const user = await get(`
      SELECT id, username, full_name, bio, location, avatar, is_public, created_at
      FROM users WHERE id = ?
    `, [newUserId]);

    return res.status(201).json({
      success: true,
      message: 'Ro\'yxatdan muvaffaqiyatli o\'tdingiz! Xush kelibsiz!',
      token,
      user
    });
  } catch (err) {
    console.error('Register xatosi:', err);
    return res.status(500).json({ success: false, message: 'Serverda xatolik yuz berdi.' });
  }
});

// Tizimga kirish (Login)
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username va parol kiritilishi shart!'
      });
    }

    const cleanUsername = username.trim().toLowerCase();
    const user = await get(`SELECT * FROM users WHERE username = ?`, [cleanUsername]);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Foydalanuvchi nomi yoki parol noto\'g\'ri!'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Foydalanuvchi nomi yoki parol noto\'g\'ri!'
      });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    const safeUser = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      bio: user.bio,
      location: user.location,
      avatar: user.avatar,
      is_public: user.is_public,
      created_at: user.created_at
    };

    return res.json({
      success: true,
      message: 'Xush kelibsiz, ' + user.full_name + '!',
      token,
      user: safeUser
    });
  } catch (err) {
    console.error('Login xatosi:', err);
    return res.status(500).json({ success: false, message: 'Serverda xatolik yuz berdi.' });
  }
});

// Hozirgi foydalanuvchi ma'lumoti (/me)
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await get(`
      SELECT id, username, full_name, bio, location, avatar, is_public, created_at
      FROM users WHERE id = ?
    `, [req.user.id]);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Foydalanuvchi topilmadi.' });
    }

    const stats = await get(`
      SELECT 
        COUNT(*) as total_members,
        MAX(generation_level) as max_generation,
        MIN(generation_level) as min_generation,
        SUM(CASE WHEN is_alive = 1 THEN 1 ELSE 0 END) as alive_count,
        SUM(CASE WHEN is_alive = 0 THEN 1 ELSE 0 END) as passed_count
      FROM members WHERE user_id = ?
    `, [user.id]);

    return res.json({
      success: true,
      user: {
        ...user,
        stats: stats || {}
      }
    });
  } catch (err) {
    console.error('/me xatosi:', err);
    return res.status(500).json({ success: false, message: 'Serverda xatolik yuz berdi.' });
  }
});

// Profilni yangilash
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { full_name, bio, location, avatar, is_public } = req.body;

    await run(`
      UPDATE users
      SET full_name = COALESCE(?, full_name),
          bio = COALESCE(?, bio),
          location = COALESCE(?, location),
          avatar = COALESCE(?, avatar),
          is_public = COALESCE(?, is_public)
      WHERE id = ?
    `, [
      full_name ? full_name.trim() : null,
      bio !== undefined ? bio.trim() : null,
      location !== undefined ? location.trim() : null,
      avatar !== undefined ? avatar.trim() : null,
      is_public !== undefined ? (is_public ? 1 : 0) : null,
      req.user.id
    ]);

    const updatedUser = await get(`
      SELECT id, username, full_name, bio, location, avatar, is_public, created_at
      FROM users WHERE id = ?
    `, [req.user.id]);

    return res.json({
      success: true,
      message: 'Profil muvaffaqiyatli yangilandi!',
      user: updatedUser
    });
  } catch (err) {
    console.error('Profile update xatosi:', err);
    return res.status(500).json({ success: false, message: 'Server xatosi' });
  }
});

module.exports = router;
