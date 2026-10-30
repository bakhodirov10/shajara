const express = require('express');
const router = express.Router();
const { get, run, all, GENERATION_PRESETS } = require('../db');
const { requireAuth } = require('../middleware/auth');

// SQL so'rovi: Ota, Ona, Turmush o'rtoq va Bolalari soni bilan birga olish
const MEMBERS_ENRICHED_SQL = `
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
`;

// Mening shajaramni olish
router.get('/my', requireAuth, async (req, res) => {
  try {
    const members = await all(MEMBERS_ENRICHED_SQL, [req.user.id]);

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
    `, [req.user.id]);

    return res.json({
      success: true,
      members,
      stats: stats || {},
      presets: GENERATION_PRESETS
    });
  } catch (err) {
    console.error('Mening shajaram xatosi:', err);
    return res.status(500).json({ success: false, message: 'Server xatosi yuz berdi.' });
  }
});

// Tezkor Bog'langan A'zo Qo'shish (Bola / Farzand, Turmush o'rtoq, Ota-Ona, Aka-Uka)
router.post('/quick-add', requireAuth, async (req, res) => {
  try {
    const {
      target_id,
      relation, // 'child' | 'spouse' | 'father' | 'mother' | 'sibling'
      first_name,
      last_name,
      patronymic,
      gender,
      birth_year,
      death_year,
      is_alive,
      birth_place,
      profession,
      title_honor,
      bio,
      photo_url
    } = req.body;

    if (!first_name || !first_name.trim()) {
      return res.status(400).json({ success: false, message: 'Ism kiritilishi shart!' });
    }

    const target = await get(`SELECT * FROM members WHERE id = ? AND user_id = ?`, [parseInt(target_id), req.user.id]);
    if (!target) {
      return res.status(404).json({ success: false, message: 'Asosiy shaxs (target) topilmadi.' });
    }

    let parent_id = null;
    let mother_id = null;
    let spouse_id = null;
    let gen_level = target.generation_level;
    let gen_title = 'Qarindosh';
    let rel_type = relation || 'child';
    let memberGender = gender || 'male';

    if (relation === 'child') {
      // Yangi bola/farzand qo'shish
      if (target.gender === 'female') {
        mother_id = target.id;
        parent_id = target.spouse_id || null;
      } else {
        parent_id = target.id;
        mother_id = target.spouse_id || null;
      }
      gen_level = Math.max(0, target.generation_level - 1);
      gen_title = memberGender === 'female' ? 'Qiz farzand' : 'O\'g\'il farzand';
      rel_type = 'child';
    } else if (relation === 'spouse') {
      // Turmush o'rtog'i qo'shish
      spouse_id = target.id;
      memberGender = target.gender === 'male' ? 'female' : 'male';
      gen_level = target.generation_level;
      gen_title = memberGender === 'female' ? 'Rafiqasi (Ona)' : 'Eri (Ota)';
      rel_type = 'spouse';
    } else if (relation === 'father') {
      // Ota qo'shish
      gen_level = target.generation_level + 1;
      gen_title = `${gen_level}-avlod: Ota`;
      rel_type = 'father';
      memberGender = 'male';
    } else if (relation === 'mother') {
      // Ona qo'shish
      gen_level = target.generation_level + 1;
      gen_title = `${gen_level}-avlod: Ona`;
      rel_type = 'mother';
      memberGender = 'female';
    } else if (relation === 'sibling') {
      // Aka-uka yoki opa-singil
      parent_id = target.parent_id;
      mother_id = target.mother_id;
      gen_level = target.generation_level;
      gen_title = memberGender === 'female' ? 'Opa / Singil' : 'Aka / Uka';
      rel_type = 'sibling';
    }

    const result = await run(`
      INSERT INTO members (
        user_id, first_name, last_name, patronymic, gender,
        generation_level, generation_title, relation_type,
        parent_id, mother_id, spouse_id,
        birth_year, death_year, is_alive,
        birth_place, profession, title_honor,
        bio, photo_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      req.user.id,
      first_name.trim(),
      last_name ? last_name.trim() : '',
      patronymic ? patronymic.trim() : '',
      memberGender,
      gen_level,
      gen_title,
      rel_type,
      parent_id,
      mother_id,
      spouse_id,
      birth_year ? String(birth_year).trim() : '',
      death_year ? String(death_year).trim() : '',
      is_alive === undefined ? 1 : (is_alive ? 1 : 0),
      birth_place ? birth_place.trim() : (target.birth_place || ''),
      profession ? profession.trim() : '',
      title_honor ? title_honor.trim() : '',
      bio ? bio.trim() : '',
      photo_url ? photo_url.trim() : ''
    ]);

    const newMemberId = result.id;

    // Agar turmush o'rtoq qo'shilgan bo'lsa, target shaxsning ham spouse_id sini bog'lash
    if (relation === 'spouse') {
      await run(`UPDATE members SET spouse_id = ? WHERE id = ? AND user_id = ?`, [newMemberId, target.id, req.user.id]);
    } else if (relation === 'father') {
      await run(`UPDATE members SET parent_id = ? WHERE id = ? AND user_id = ?`, [newMemberId, target.id, req.user.id]);
      if (target.mother_id) {
        await run(`UPDATE members SET spouse_id = ? WHERE id = ? AND user_id = ?`, [newMemberId, target.mother_id, req.user.id]);
        await run(`UPDATE members SET spouse_id = ? WHERE id = ? AND user_id = ?`, [target.mother_id, newMemberId, req.user.id]);
      }
    } else if (relation === 'mother') {
      await run(`UPDATE members SET mother_id = ? WHERE id = ? AND user_id = ?`, [newMemberId, target.id, req.user.id]);
      if (target.parent_id) {
        await run(`UPDATE members SET spouse_id = ? WHERE id = ? AND user_id = ?`, [newMemberId, target.parent_id, req.user.id]);
        await run(`UPDATE members SET spouse_id = ? WHERE id = ? AND user_id = ?`, [target.parent_id, newMemberId, req.user.id]);
      }
    }

    const created = await get(`SELECT * FROM members WHERE id = ?`, [newMemberId]);

    return res.status(201).json({
      success: true,
      message: `${created.first_name} muvaffaqiyatli shajaraga qo'shildi!`,
      member: created
    });
  } catch (err) {
    console.error('Quick add xatosi:', err);
    return res.status(500).json({ success: false, message: 'Server xatosi yuz berdi.' });
  }
});

// Yangi a'zo qo'shish (Umumiy)
router.post('/member', requireAuth, async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      patronymic,
      gender,
      generation_level,
      generation_title,
      relation_type,
      parent_id,
      mother_id,
      spouse_id,
      birth_year,
      death_year,
      is_alive,
      birth_place,
      profession,
      title_honor,
      bio,
      photo_url,
      notes
    } = req.body;

    if (!first_name || !first_name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Ism kiritilishi shart!'
      });
    }

    const genLevel = parseInt(generation_level) || 1;
    let defaultTitle = generation_title;
    if (!defaultTitle) {
      const preset = GENERATION_PRESETS.find(p => p.level === genLevel);
      defaultTitle = preset ? preset.title : `${genLevel}-avlod`;
    }

    const result = await run(`
      INSERT INTO members (
        user_id, first_name, last_name, patronymic, gender,
        generation_level, generation_title, relation_type,
        parent_id, mother_id, spouse_id,
        birth_year, death_year, is_alive,
        birth_place, profession, title_honor,
        bio, photo_url, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      req.user.id,
      first_name.trim(),
      last_name ? last_name.trim() : '',
      patronymic ? patronymic.trim() : '',
      gender === 'female' ? 'female' : 'male',
      genLevel,
      defaultTitle,
      relation_type || 'child',
      parent_id ? parseInt(parent_id) : null,
      mother_id ? parseInt(mother_id) : null,
      spouse_id ? parseInt(spouse_id) : null,
      birth_year ? String(birth_year).trim() : '',
      death_year ? String(death_year).trim() : '',
      is_alive === undefined ? 1 : (is_alive ? 1 : 0),
      birth_place ? birth_place.trim() : '',
      profession ? profession.trim() : '',
      title_honor ? title_honor.trim() : '',
      bio ? bio.trim() : '',
      photo_url ? photo_url.trim() : '',
      notes ? notes.trim() : ''
    ]);

    const newMemberId = result.id;

    // Agar spouse_id berilgan bo'lsa, o'zaro bog'lash
    if (spouse_id) {
      await run(`UPDATE members SET spouse_id = ? WHERE id = ? AND user_id = ?`, [newMemberId, parseInt(spouse_id), req.user.id]);
    }

    const newMember = await get(`SELECT * FROM members WHERE id = ?`, [newMemberId]);

    return res.status(201).json({
      success: true,
      message: `${newMember.first_name} shajaraga muvaffaqiyatli qo'shildi!`,
      member: newMember
    });
  } catch (err) {
    console.error('Member qo\'shish xatosi:', err);
    return res.status(500).json({ success: false, message: 'Server xatosi yuz berdi.' });
  }
});

// Avlod ma'lumotini tahrirlash (Faqat egasi tahrirlay oladi)
router.put('/member/:id', requireAuth, async (req, res) => {
  try {
    const memberId = parseInt(req.params.id);
    const existing = await get(`SELECT * FROM members WHERE id = ?`, [memberId]);

    if (!existing) {
      return res.status(404).json({ success: false, message: "A'zo topilmadi." });
    }

    if (existing.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Ruxsat berilmadi! Siz faqat o\'zingizning shajarangizni o\'zgartira olasiz.'
      });
    }

    const {
      first_name,
      last_name,
      patronymic,
      gender,
      generation_level,
      generation_title,
      relation_type,
      parent_id,
      mother_id,
      spouse_id,
      birth_year,
      death_year,
      is_alive,
      birth_place,
      profession,
      title_honor,
      bio,
      photo_url,
      notes
    } = req.body;

    await run(`
      UPDATE members SET
        first_name = COALESCE(?, first_name),
        last_name = COALESCE(?, last_name),
        patronymic = COALESCE(?, patronymic),
        gender = COALESCE(?, gender),
        generation_level = COALESCE(?, generation_level),
        generation_title = COALESCE(?, generation_title),
        relation_type = COALESCE(?, relation_type),
        parent_id = ?,
        mother_id = ?,
        spouse_id = ?,
        birth_year = COALESCE(?, birth_year),
        death_year = COALESCE(?, death_year),
        is_alive = COALESCE(?, is_alive),
        birth_place = COALESCE(?, birth_place),
        profession = COALESCE(?, profession),
        title_honor = COALESCE(?, title_honor),
        bio = COALESCE(?, bio),
        photo_url = COALESCE(?, photo_url),
        notes = COALESCE(?, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `, [
      first_name ? first_name.trim() : null,
      last_name !== undefined ? last_name.trim() : null,
      patronymic !== undefined ? patronymic.trim() : null,
      gender || null,
      generation_level !== undefined ? parseInt(generation_level) : null,
      generation_title || null,
      relation_type || null,
      parent_id ? parseInt(parent_id) : (parent_id === null ? null : existing.parent_id),
      mother_id ? parseInt(mother_id) : (mother_id === null ? null : existing.mother_id),
      spouse_id ? parseInt(spouse_id) : (spouse_id === null ? null : existing.spouse_id),
      birth_year !== undefined ? String(birth_year).trim() : null,
      death_year !== undefined ? String(death_year).trim() : null,
      is_alive !== undefined ? (is_alive ? 1 : 0) : null,
      birth_place !== undefined ? birth_place.trim() : null,
      profession !== undefined ? profession.trim() : null,
      title_honor !== undefined ? title_honor.trim() : null,
      bio !== undefined ? bio.trim() : null,
      photo_url !== undefined ? photo_url.trim() : null,
      notes !== undefined ? notes.trim() : null,
      memberId,
      req.user.id
    ]);

    const updated = await get(`SELECT * FROM members WHERE id = ?`, [memberId]);

    return res.json({
      success: true,
      message: 'Ma\'lumot muvaffaqiyatli yangilandi!',
      member: updated
    });
  } catch (err) {
    console.error('Member tahrirlash xatosi:', err);
    return res.status(500).json({ success: false, message: 'Server xatosi yuz berdi.' });
  }
});

// Avlodni o'chirish
router.delete('/member/:id', requireAuth, async (req, res) => {
  try {
    const memberId = parseInt(req.params.id);
    const existing = await get(`SELECT * FROM members WHERE id = ?`, [memberId]);

    if (!existing) {
      return res.status(404).json({ success: false, message: 'A\'zo topilmadi.' });
    }

    if (existing.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Ruxsat berilmadi! Siz faqat o\'zingizning shajarangizdagi a\'zoni o\'chira olasiz.'
      });
    }

    await run(`UPDATE members SET parent_id = NULL WHERE parent_id = ? AND user_id = ?`, [memberId, req.user.id]);
    await run(`UPDATE members SET mother_id = NULL WHERE mother_id = ? AND user_id = ?`, [memberId, req.user.id]);
    await run(`UPDATE members SET spouse_id = NULL WHERE spouse_id = ? AND user_id = ?`, [memberId, req.user.id]);
    await run(`DELETE FROM members WHERE id = ? AND user_id = ?`, [memberId, req.user.id]);

    return res.json({
      success: true,
      message: `${existing.first_name} shajaradan muvaffaqiyatli o'chirildi!`
    });
  } catch (err) {
    console.error('Member o\'chirish xatosi:', err);
    return res.status(500).json({ success: false, message: 'Server xatosi yuz berdi.' });
  }
});

// 7 ta bo'sh avlod slotlarini bir bosishda yaratish
router.post('/init-7-generations', requireAuth, async (req, res) => {
  try {
    const existingMembers = await all(`SELECT generation_level FROM members WHERE user_id = ?`, [req.user.id]);
    const existingLevels = new Set(existingMembers.map(m => m.generation_level));

    let createdCount = 0;
    for (const preset of GENERATION_PRESETS) {
      if (!existingLevels.has(preset.level)) {
        await run(`
          INSERT INTO members (
            user_id, first_name, last_name, gender,
            generation_level, generation_title, relation_type,
            is_alive, profession, bio
          ) VALUES (?, ?, '', 'male', ?, ?, ?, 0, '', ?)
        `, [
          req.user.id,
          `[${preset.title.split(':')[1]?.trim() || preset.title} ismi]`,
          preset.level,
          preset.title,
          preset.relation,
          preset.desc
        ]);
        createdCount++;
      }
    }

    return res.json({
      success: true,
      message: `${createdCount} ta avlod katagi muvaffaqiyatli tayyorlandi! Endi ularni to'ldirishingiz mumkin.`
    });
  } catch (err) {
    console.error('7-avlod init xatosi:', err);
    return res.status(500).json({ success: false, message: 'Server xatosi yuz berdi.' });
  }
});

// Shajarani JSON formatida yuklab olish (Export)
router.get('/export-json', requireAuth, async (req, res) => {
  try {
    const user = await get(`SELECT id, username, full_name, bio, location FROM users WHERE id = ?`, [req.user.id]);
    const members = await all(MEMBERS_ENRICHED_SQL, [req.user.id]);

    const exportData = {
      version: "2.0",
      system: "Shajara.uz - Ko'p Bolali Oila Shajarasi",
      exported_at: new Date().toISOString(),
      owner: user,
      members: members
    };

    res.setHeader('Content-Disposition', `attachment; filename=shajara_${user.username}.json`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.send(JSON.stringify(exportData, null, 2));
  } catch (err) {
    console.error('Export xatosi:', err);
    return res.status(500).json({ success: false, message: 'Eksportda xatolik yuz berdi.' });
  }
});

// Shajarani JSON formatidan tiklash / yuklash (Import)
router.post('/import-json', requireAuth, async (req, res) => {
  try {
    const { members, replace_existing = true } = req.body;

    if (!members || !Array.isArray(members) || members.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Yaroqsiz JSON ma\'lumoti: a\'zolar ro\'yxati (members) topilmadi.'
      });
    }

    if (replace_existing) {
      await run(`DELETE FROM members WHERE user_id = ?`, [req.user.id]);
    }

    const idMap = new Map(); // oldId -> newId

    // 1-bosqich: A'zolarni bazaga kiritish (munosabatlarsiz)
    for (const m of members) {
      if (!m.first_name) continue;
      const result = await run(`
        INSERT INTO members (
          user_id, first_name, last_name, patronymic, gender,
          generation_level, generation_title, relation_type,
          birth_year, death_year, is_alive,
          birth_place, profession, title_honor,
          bio, photo_url, notes, order_num
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        req.user.id,
        m.first_name ? m.first_name.trim() : '',
        m.last_name ? m.last_name.trim() : '',
        m.patronymic ? m.patronymic.trim() : '',
        m.gender === 'female' ? 'female' : 'male',
        m.generation_level !== undefined ? parseInt(m.generation_level) : 1,
        m.generation_title || `${m.generation_level || 1}-avlod`,
        m.relation_type || 'child',
        m.birth_year ? String(m.birth_year).trim() : '',
        m.death_year ? String(m.death_year).trim() : '',
        m.is_alive === undefined ? 1 : (m.is_alive ? 1 : 0),
        m.birth_place ? m.birth_place.trim() : '',
        m.profession ? m.profession.trim() : '',
        m.title_honor ? m.title_honor.trim() : '',
        m.bio ? m.bio.trim() : '',
        m.photo_url ? m.photo_url.trim() : '',
        m.notes ? m.notes.trim() : '',
        m.order_num || 0
      ]);

      if (m.id) {
        idMap.set(m.id, result.id);
      }
    }

    // 2-bosqich: Qarindoshlik rishtalarini (parent_id, mother_id, spouse_id) qayta tiklash
    for (const m of members) {
      if (!m.id || !idMap.has(m.id)) continue;
      const newId = idMap.get(m.id);

      const newParentId = m.parent_id && idMap.has(m.parent_id) ? idMap.get(m.parent_id) : null;
      const newMotherId = m.mother_id && idMap.has(m.mother_id) ? idMap.get(m.mother_id) : null;
      const newSpouseId = m.spouse_id && idMap.has(m.spouse_id) ? idMap.get(m.spouse_id) : null;

      if (newParentId || newMotherId || newSpouseId) {
        await run(`
          UPDATE members
          SET parent_id = ?, mother_id = ?, spouse_id = ?
          WHERE id = ? AND user_id = ?
        `, [newParentId, newMotherId, newSpouseId, newId, req.user.id]);
      }
    }

    return res.json({
      success: true,
      message: `${idMap.size} nafar ajdod va sulola a'zosi muvaffaqiyatli tiklandi!`,
      imported_count: idMap.size
    });
  } catch (err) {
    console.error('Import JSON xatosi:', err);
    return res.status(500).json({ success: false, message: 'JSON ma\'lumotini yuklashda xatolik yuz berdi.' });
  }
});

module.exports = router;
