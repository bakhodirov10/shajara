const express = require('express');
const router = express.Router();
const { get, run } = require('../db');
const { optionalAuth, requireAuth } = require('../middleware/auth');
const { SAMPLE_FAMILY_TREE } = require('../sampleData');

// =========================================================
// RECURSIVE HELPER FUNCTIONS
// =========================================================

function sortTreeChildrenRecursively(node) {
  if (!node) return node;
  if (Array.isArray(node.children)) {
    node.children.sort((a, b) => {
      const yA = a.birthYear ? parseInt(a.birthYear, 10) : 99999;
      const yB = b.birthYear ? parseInt(b.birthYear, 10) : 99999;
      if (yA !== yB) return yA - yB;
      return (a.id || '').localeCompare(b.id || '');
    });
    node.children.forEach(child => sortTreeChildrenRecursively(child));
  }
  return node;
}

function findPersonById(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findPersonById(child, id);
      if (found) return found;
    }
  }
  return null;
}

function findParentOf(node, id) {
  if (!node || !Array.isArray(node.children)) return null;
  const idx = node.children.findIndex(c => c.id === id);
  if (idx !== -1) {
    return { parent: node, index: idx };
  }
  for (const child of node.children) {
    const found = findParentOf(child, id);
    if (found) return found;
  }
  return null;
}

function countTotalMembers(node) {
  if (!node) return 0;
  let count = 1;
  if (node.spouse && node.spouse.trim()) count += 1;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      count += countTotalMembers(child);
    }
  }
  return count;
}

function calculateMaxDepth(node) {
  if (!node) return 0;
  if (!Array.isArray(node.children) || node.children.length === 0) return 1;
  let maxChildDepth = 0;
  for (const child of node.children) {
    maxChildDepth = Math.max(maxChildDepth, calculateMaxDepth(child));
  }
  return 1 + maxChildDepth;
}

function calculateTreeStats(node) {
  let totalMembers = 0;
  let maleCount = 0;
  let femaleCount = 0;
  let livingCount = 0;
  let passedCount = 0;

  function traverse(person) {
    if (!person) return;
    totalMembers++;
    if (person.gender === 'female') {
      femaleCount++;
    } else {
      maleCount++;
    }

    if (person.deathYear) {
      passedCount++;
    } else {
      livingCount++;
    }

    // Spouse
    if (person.spouse && person.spouse.trim()) {
      totalMembers++;
      if (person.gender === 'female') {
        maleCount++; // spouse is male
      } else {
        femaleCount++; // spouse is female
      }

      if (person.spouseDeathYear) {
        passedCount++;
      } else {
        livingCount++;
      }
    }

    if (Array.isArray(person.children)) {
      person.children.forEach(traverse);
    }
  }

  traverse(node);

  return {
    totalMembers,
    maleCount,
    femaleCount,
    livingCount,
    passedCount,
    maxDepth: calculateMaxDepth(node)
  };
}

// Get tree_id for request (authenticated user tree or default shared tree)
function resolveTreeId(req) {
  if (req.user && req.user.id) {
    return `user_${req.user.id}`;
  }
  return req.query.tree_id || 'default';
}

// Helper to fetch or create tree row in DB
async function getOrCreateTreeRow(treeId, userId = null) {
  let row = await get(`SELECT * FROM trees WHERE tree_id = ?`, [treeId]);
  if (!row) {
    const initialTree = JSON.parse(JSON.stringify(SAMPLE_FAMILY_TREE));
    const name = userId ? `Mening shajaram` : 'Normat ota Mirzayev oilasi shajarasi';
    const result = await run(`
      INSERT INTO trees (tree_id, user_id, name, tree_data)
      VALUES (?, ?, ?, ?)
    `, [treeId, userId, name, JSON.stringify(initialTree)]);

    row = await get(`SELECT * FROM trees WHERE id = ?`, [result.id]);
  }
  return row;
}

// =========================================================
// API ENDPOINTS
// =========================================================

/**
 * GET /api/tree
 * Shajara daraxtini bazadan olish
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const treeId = resolveTreeId(req);
    const row = await getOrCreateTreeRow(treeId, req.user ? req.user.id : null);

    let parsedTree;
    try {
      parsedTree = JSON.parse(row.tree_data);
    } catch (e) {
      parsedTree = JSON.parse(JSON.stringify(SAMPLE_FAMILY_TREE));
    }

    sortTreeChildrenRecursively(parsedTree);
    const stats = calculateTreeStats(parsedTree);

    return res.json({
      success: true,
      tree_id: row.tree_id,
      name: row.name,
      updated_at: row.updated_at,
      stats,
      tree: parsedTree
    });
  } catch (err) {
    console.error('GET /api/tree xatosi:', err);
    return res.status(500).json({ success: false, message: 'Shajarani yuklashda server xatosi' });
  }
});

/**
 * PUT /api/tree
 * To'liq shajara daraxtini yangilash / saqlash
 */
router.put('/', optionalAuth, async (req, res) => {
  try {
    const { tree, name } = req.body;
    if (!tree || !tree.id || !tree.fullName) {
      return res.status(400).json({
        success: false,
        message: 'Yaroqsiz shajara ma\'lumotlari: id va fullName kiritilishi shart'
      });
    }

    if (!Array.isArray(tree.children)) {
      tree.children = [];
    }

    sortTreeChildrenRecursively(tree);
    const treeId = resolveTreeId(req);
    const serialized = JSON.stringify(tree);

    // Tekshirish va yangilash
    const existing = await get(`SELECT id FROM trees WHERE tree_id = ?`, [treeId]);
    if (existing) {
      await run(`
        UPDATE trees
        SET tree_data = ?,
            name = COALESCE(?, name),
            updated_at = CURRENT_TIMESTAMP
        WHERE tree_id = ?
      `, [serialized, name || null, treeId]);
    } else {
      await run(`
        INSERT INTO trees (tree_id, user_id, name, tree_data)
        VALUES (?, ?, ?, ?)
      `, [treeId, req.user ? req.user.id : null, name || 'Mening Shajaram', serialized]);
    }

    const updatedRow = await get(`SELECT * FROM trees WHERE tree_id = ?`, [treeId]);
    const stats = calculateTreeStats(tree);

    return res.json({
      success: true,
      message: 'Shajara muvaffaqiyatli saqlandi!',
      tree_id: treeId,
      updated_at: updatedRow.updated_at,
      stats,
      tree
    });
  } catch (err) {
    console.error('PUT /api/tree xatosi:', err);
    return res.status(500).json({ success: false, message: 'Shajarani saqlashda xatolik yuz berdi' });
  }
});

/**
 * POST /api/tree/child
 * Ota-ona tuguniga yangi farzand qo'shish
 */
router.post('/child', optionalAuth, async (req, res) => {
  try {
    const { parentId, child } = req.body;
    if (!parentId) {
      return res.status(400).json({ success: false, message: 'Ota-ona identifikatori (parentId) ko\'rsatilmadi' });
    }
    if (!child || !child.fullName || !child.fullName.trim()) {
      return res.status(400).json({ success: false, message: 'Farzandning to\'liq ismi kiritilishi shart' });
    }

    const treeId = resolveTreeId(req);
    const row = await getOrCreateTreeRow(treeId, req.user ? req.user.id : null);
    const tree = JSON.parse(row.tree_data);

    const parent = findPersonById(tree, parentId);
    if (!parent) {
      return res.status(404).json({ success: false, message: 'Ota-ona topilmadi' });
    }

    if (!Array.isArray(parent.children)) {
      parent.children = [];
    }

    const birthYearVal = child.birthYear ? parseInt(child.birthYear, 10) : null;
    const deathYearVal = child.deathYear ? parseInt(child.deathYear, 10) : null;
    const spouseBirthVal = child.spouseBirthYear ? parseInt(child.spouseBirthYear, 10) : null;
    const spouseDeathVal = child.spouseDeathYear ? parseInt(child.spouseDeathYear, 10) : null;

    const newChild = {
      id: child.id || ('p_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
      fullName: child.fullName.trim(),
      gender: child.gender === 'female' ? 'female' : 'male',
      birthYear: isNaN(birthYearVal) ? null : birthYearVal,
      deathYear: isNaN(deathYearVal) ? null : deathYearVal,
      spouse: child.spouse ? child.spouse.trim() : '',
      spouseBirthYear: isNaN(spouseBirthVal) ? null : spouseBirthVal,
      spouseDeathYear: isNaN(spouseDeathVal) ? null : spouseDeathVal,
      children: Array.isArray(child.children) ? child.children : []
    };

    parent.children.push(newChild);
    sortTreeChildrenRecursively(tree);

    await run(`
      UPDATE trees
      SET tree_data = ?, updated_at = CURRENT_TIMESTAMP
      WHERE tree_id = ?
    `, [JSON.stringify(tree), treeId]);

    const stats = calculateTreeStats(tree);

    return res.status(201).json({
      success: true,
      message: `«${newChild.fullName}» shajaraga muvaffaqiyatli qo'shildi!`,
      child: newChild,
      stats,
      tree
    });
  } catch (err) {
    console.error('POST /api/tree/child xatosi:', err);
    return res.status(500).json({ success: false, message: 'Farzand qo\'shishda xatolik yuz berdi' });
  }
});

/**
 * PUT /api/tree/person/:id
 * Oila a'zosi va uning ayoli ma'lumotlarini tahrirlash
 */
router.put('/person/:id', optionalAuth, async (req, res) => {
  try {
    const personId = req.params.id;
    const data = req.body;

    if (!data.fullName || !data.fullName.trim()) {
      return res.status(400).json({ success: false, message: 'To\'liq ism kiritilishi shart' });
    }

    const treeId = resolveTreeId(req);
    const row = await getOrCreateTreeRow(treeId, req.user ? req.user.id : null);
    const tree = JSON.parse(row.tree_data);

    const person = findPersonById(tree, personId);
    if (!person) {
      return res.status(404).json({ success: false, message: 'Shaxs topilmadi' });
    }

    const birthYearVal = data.birthYear ? parseInt(data.birthYear, 10) : null;
    const deathYearVal = data.deathYear ? parseInt(data.deathYear, 10) : null;
    const spouseBirthVal = data.spouseBirthYear ? parseInt(data.spouseBirthYear, 10) : null;
    const spouseDeathVal = data.spouseDeathYear ? parseInt(data.spouseDeathYear, 10) : null;

    person.fullName = data.fullName.trim();
    if (data.gender) person.gender = data.gender;
    person.birthYear = isNaN(birthYearVal) ? null : birthYearVal;
    person.deathYear = isNaN(deathYearVal) ? null : deathYearVal;
    person.spouse = data.spouse !== undefined ? (data.spouse ? data.spouse.trim() : '') : person.spouse;
    person.spouseBirthYear = isNaN(spouseBirthVal) ? null : spouseBirthVal;
    person.spouseDeathYear = isNaN(spouseDeathVal) ? null : spouseDeathVal;

    sortTreeChildrenRecursively(tree);

    await run(`
      UPDATE trees
      SET tree_data = ?, updated_at = CURRENT_TIMESTAMP
      WHERE tree_id = ?
    `, [JSON.stringify(tree), treeId]);

    const stats = calculateTreeStats(tree);

    return res.json({
      success: true,
      message: 'Ma\'lumotlar muvaffaqiyatli saqlandi!',
      person,
      stats,
      tree
    });
  } catch (err) {
    console.error('PUT /api/tree/person/:id xatosi:', err);
    return res.status(500).json({ success: false, message: 'Tahrirlashda server xatosi' });
  }
});

/**
 * DELETE /api/tree/person/:id
 * Shaxs va uning barcha avlodlarini o'chirish
 */
router.delete('/person/:id', optionalAuth, async (req, res) => {
  try {
    const personId = req.params.id;
    const treeId = resolveTreeId(req);
    const row = await getOrCreateTreeRow(treeId, req.user ? req.user.id : null);
    const tree = JSON.parse(row.tree_data);

    if (tree.id === personId) {
      return res.status(400).json({
        success: false,
        message: 'Bosh ajdodni o\'chirib bo\'lmaydi, faqat tahrirlash mumkin!'
      });
    }

    const parentResult = findParentOf(tree, personId);
    if (!parentResult) {
      return res.status(404).json({ success: false, message: 'O\'chirilishi kerak bo\'lgan shaxs topilmadi' });
    }

    const { parent, index } = parentResult;
    const deletedPerson = parent.children[index];
    parent.children.splice(index, 1);

    await run(`
      UPDATE trees
      SET tree_data = ?, updated_at = CURRENT_TIMESTAMP
      WHERE tree_id = ?
    `, [JSON.stringify(tree), treeId]);

    const stats = calculateTreeStats(tree);

    return res.json({
      success: true,
      message: `«${deletedPerson.fullName}» shajaradan muvaffaqiyatli o'chirildi`,
      deletedPerson,
      stats,
      tree
    });
  } catch (err) {
    console.error('DELETE /api/tree/person/:id xatosi:', err);
    return res.status(500).json({ success: false, message: 'O\'chirishda server xatosi' });
  }
});

/**
 * POST /api/tree/reset
 * Shajarani standart namunaviy holatga qaytarish
 */
router.post('/reset', optionalAuth, async (req, res) => {
  try {
    const treeId = resolveTreeId(req);
    const cleanSample = JSON.parse(JSON.stringify(SAMPLE_FAMILY_TREE));
    sortTreeChildrenRecursively(cleanSample);

    await run(`
      UPDATE trees
      SET tree_data = ?, updated_at = CURRENT_TIMESTAMP
      WHERE tree_id = ?
    `, [JSON.stringify(cleanSample), treeId]);

    const stats = calculateTreeStats(cleanSample);

    return res.json({
      success: true,
      message: 'Namunaviy oila shajarasi muvaffaqiyatli tiklandi!',
      stats,
      tree: cleanSample
    });
  } catch (err) {
    console.error('POST /api/tree/reset xatosi:', err);
    return res.status(500).json({ success: false, message: 'Tiklashda xatolik yuz berdi' });
  }
});

/**
 * POST /api/tree/import
 * JSON fayldan shajarani bazaga import qilish
 */
router.post('/import', optionalAuth, async (req, res) => {
  try {
    const importedTree = req.body.tree || req.body;
    if (!importedTree || !importedTree.id || !importedTree.fullName || !Array.isArray(importedTree.children)) {
      return res.status(400).json({
        success: false,
        message: 'Yaroqsiz shajara formati: id, fullName va children massivi bo\'lishi shart'
      });
    }

    sortTreeChildrenRecursively(importedTree);
    const treeId = resolveTreeId(req);

    await run(`
      UPDATE trees
      SET tree_data = ?, updated_at = CURRENT_TIMESTAMP
      WHERE tree_id = ?
    `, [JSON.stringify(importedTree), treeId]);

    const stats = calculateTreeStats(importedTree);

    return res.json({
      success: true,
      message: 'Shajara fayldan muvaffaqiyatli import qilindi!',
      stats,
      tree: importedTree
    });
  } catch (err) {
    console.error('POST /api/tree/import xatosi:', err);
    return res.status(500).json({ success: false, message: 'Import qilishda xatolik yuz berdi' });
  }
});

/**
 * GET /api/tree/export
 * JSON formatida zaxira fayl sifatida yuklab olish
 */
router.get('/export', optionalAuth, async (req, res) => {
  try {
    const treeId = resolveTreeId(req);
    const row = await getOrCreateTreeRow(treeId, req.user ? req.user.id : null);
    const parsed = JSON.parse(row.tree_data);
    sortTreeChildrenRecursively(parsed);

    const safeName = (parsed.fullName || 'shajara').replace(/[^a-zA-Z0-9_\u0400-\u04FF]/g, '_');
    const filename = `shajara_${safeName}_${new Date().toISOString().slice(0, 10)}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(JSON.stringify(parsed, null, 2));
  } catch (err) {
    console.error('GET /api/tree/export xatosi:', err);
    return res.status(500).json({ success: false, message: 'Eksport qilishda xatolik' });
  }
});

/**
 * GET /api/tree/stats
 * Shajara statistikasi
 */
router.get('/stats', optionalAuth, async (req, res) => {
  try {
    const treeId = resolveTreeId(req);
    const row = await getOrCreateTreeRow(treeId, req.user ? req.user.id : null);
    const parsed = JSON.parse(row.tree_data);
    const stats = calculateTreeStats(parsed);

    return res.json({
      success: true,
      tree_id: treeId,
      name: row.name,
      stats
    });
  } catch (err) {
    console.error('GET /api/tree/stats xatosi:', err);
    return res.status(500).json({ success: false, message: 'Statistikani hisoblashda xatolik' });
  }
});

module.exports = router;
