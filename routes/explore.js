const express = require('express');
const router = express.Router();
const { get, all } = require('../db');
const { optionalAuth } = require('../middleware/auth');

// Barcha ochiq foydalanuvchilar va shajaralarni qidirish
router.get('/users', async (req, res) => {
  try {
    const q = req.query.q ? req.query.q.trim() : '';

    let sql = `
      SELECT 
        u.id, u.username, u.full_name, u.bio, u.location, u.avatar, u.created_at,
        COUNT(m.id) as member_count,
        MAX(m.generation_level) as max_generation,
        SUM(CASE WHEN m.is_alive = 1 THEN 1 ELSE 0 END) as alive_count,
        SUM(CASE WHEN m.is_alive = 0 THEN 1 ELSE 0 END) as passed_count
      FROM users u
      LEFT JOIN members m ON u.id = m.user_id
      WHERE u.is_public = 1
    `;

    const params = [];
    if (q) {
      sql += ` AND (u.full_name LIKE ? OR u.username LIKE ? OR u.location LIKE ? OR m.first_name LIKE ? OR m.last_name LIKE ?)`;
      const searchParam = `%${q}%`;
      params.push(searchParam, searchParam, searchParam, searchParam, searchParam);
    }

    sql += ` GROUP BY u.id, u.username, u.full_name, u.bio, u.location, u.avatar, u.created_at ORDER BY member_count DESC, u.created_at DESC LIMIT 50`;

    const users = await all(sql, params);
    return res.json({ success: true, users });
  } catch (err) {
    console.error('Explore users xatosi:', err);
    return res.status(500).json({ success: false, message: 'Server xatosi yuz berdi.' });
  }
});

// Boshqa foydalanuvchining shajarasini ko'rish (Read-only rejim)
router.get('/user/:username', optionalAuth, async (req, res) => {
  try {
    const username = req.params.username.trim().toLowerCase();
    const targetUser = await get(`
      SELECT id, username, full_name, bio, location, avatar, is_public, created_at
      FROM users WHERE LOWER(username) = ?
    `, [username]);

    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'Bunday foydalanuvchi topilmadi.' });
    }

    const isOwner = req.user && req.user.id === targetUser.id;

    if (!targetUser.is_public && !isOwner) {
      return res.status(403).json({
        success: false,
        message: 'Ushbu foydalanuvchi o\'z shajarasini shaxsiy (yopiq) qilgan.'
      });
    }

    const members = await all(`
      SELECT m.*, 
             p.first_name as parent_first_name, 
             p.last_name as parent_last_name,
             mot.first_name as mother_first_name,
             mot.last_name as mother_last_name,
             sp.first_name as spouse_first_name,
             sp.last_name as spouse_last_name,
             (SELECT COUNT(*) FROM members c WHERE (c.parent_id = m.id OR c.mother_id = m.id) AND c.user_id = m.user_id) as children_count
      FROM members m
      LEFT JOIN members p ON m.parent_id = p.id
      LEFT JOIN members mot ON m.mother_id = mot.id
      LEFT JOIN members sp ON m.spouse_id = sp.id
      WHERE m.user_id = ?
      ORDER BY m.generation_level DESC, m.order_num ASC, m.id ASC
    `, [targetUser.id]);

    const stats = await get(`
      SELECT 
        COUNT(*) as total_members,
        MAX(generation_level) as max_generation,
        MIN(generation_level) as min_generation,
        SUM(CASE WHEN gender = 'male' THEN 1 ELSE 0 END) as male_count,
        SUM(CASE WHEN gender = 'female' THEN 1 ELSE 0 END) as female_count,
        SUM(CASE WHEN is_alive = 1 THEN 1 ELSE 0 END) as alive_count,
        SUM(CASE WHEN is_alive = 0 THEN 1 ELSE 0 END) as passed_count
      FROM members WHERE user_id = ?
    `, [targetUser.id]);

    return res.json({
      success: true,
      user: targetUser,
      is_owner: !!isOwner,
      members,
      stats: stats || {}
    });
  } catch (err) {
    console.error('Explore user view xatosi:', err);
    return res.status(500).json({ success: false, message: 'Server xatosi yuz berdi.' });
  }
});

module.exports = router;
