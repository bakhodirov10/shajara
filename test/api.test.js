const assert = require('assert');
const { initDB, get, all } = require('../db');

// Test suite for the backend API logic
async function runTests() {
  console.log('🧪 Shajara Backend testlari boshlanmoqda...\n');

  // 1. Bazani initsializatsiya qilish
  await initDB();
  console.log('✅ 1. Baza initsializatsiyasi muvaffaqiyatli o\'tdi.');

  // 2. Standart shajara mavjudligini tekshirish
  const defaultTreeRow = await get(`SELECT * FROM trees WHERE tree_id = 'default'`);
  assert(defaultTreeRow, 'Default tree bazada mavjud bo\'lishi kerak');
  const treeData = JSON.parse(defaultTreeRow.tree_data);
  assert.strictEqual(treeData.id, 'p_root', 'Root id p_root bo\'lishi kerak');
  assert(treeData.fullName.includes('Normat ota'), 'Bosh ajdod Normat ota bo\'lishi kerak');
  assert(Array.isArray(treeData.children), 'Farzandlar massiv bo\'lishi kerak');
  console.log('✅ 2. Standart shajara (Normat ota) tekshiruvi o\'tdi. Farzandlar soni:', treeData.children.length);

  // 3. Tree helper funksiyalarni tekshirish
  const treeRoutes = require('../routes/tree');
  // Mock express request & response
  function createMockRes() {
    return {
      statusCode: 200,
      jsonData: null,
      headers: {},
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.jsonData = data;
        return this;
      },
      setHeader(k, v) {
        this.headers[k] = v;
      },
      send(body) {
        this.body = body;
        return this;
      }
    };
  }

  // Test GET /api/tree
  const mockReq1 = { query: { tree_id: 'default' }, user: null };
  const mockRes1 = createMockRes();
  // Call route handler directly
  const getTreeHandler = treeRoutes.stack.find(l => l.route && l.route.path === '/' && l.route.methods.get).route.stack[1].handle;
  await getTreeHandler(mockReq1, mockRes1);
  assert.strictEqual(mockRes1.statusCode, 200);
  assert.strictEqual(mockRes1.jsonData.success, true);
  assert(mockRes1.jsonData.tree);
  assert(mockRes1.jsonData.stats.totalMembers >= 10);
  console.log('✅ 3. GET /api/tree muvaffaqiyatli ishladi. Jami a\'zolar:', mockRes1.jsonData.stats.totalMembers);

  // Test POST /api/tree/child
  const mockReq2 = {
    body: {
      parentId: 'p_root',
      child: {
        fullName: 'Test Farzand',
        gender: 'male',
        birthYear: '1970',
        spouse: 'Test Ayoli'
      }
    },
    query: { tree_id: 'default' },
    user: null
  };
  const mockRes2 = createMockRes();
  const addChildHandler = treeRoutes.stack.find(l => l.route && l.route.path === '/child' && l.route.methods.post).route.stack[1].handle;
  await addChildHandler(mockReq2, mockRes2);
  assert.strictEqual(mockRes2.statusCode, 201);
  assert.strictEqual(mockRes2.jsonData.success, true);
  const newChildId = mockRes2.jsonData.child.id;
  assert(newChildId);
  console.log('✅ 4. POST /api/tree/child muvaffaqiyatli qo\'shildi. Yangi farzand ID:', newChildId);

  // Test PUT /api/tree/person/:id
  const mockReq3 = {
    params: { id: newChildId },
    body: {
      fullName: 'Test Farzand Yangilangan',
      birthYear: '1971',
      spouse: 'Test Ayoli Yangi'
    },
    query: { tree_id: 'default' },
    user: null
  };
  const mockRes3 = createMockRes();
  const editPersonHandler = treeRoutes.stack.find(l => l.route && l.route.path === '/person/:id' && l.route.methods.put).route.stack[1].handle;
  await editPersonHandler(mockReq3, mockRes3);
  assert.strictEqual(mockRes3.statusCode, 200);
  assert.strictEqual(mockRes3.jsonData.person.fullName, 'Test Farzand Yangilangan');
  console.log('✅ 5. PUT /api/tree/person/:id muvaffaqiyatli yangilandi.');

  // Test DELETE /api/tree/person/:id
  const mockReq4 = {
    params: { id: newChildId },
    query: { tree_id: 'default' },
    user: null
  };
  const mockRes4 = createMockRes();
  const deletePersonHandler = treeRoutes.stack.find(l => l.route && l.route.path === '/person/:id' && l.route.methods.delete).route.stack[1].handle;
  await deletePersonHandler(mockReq4, mockRes4);
  assert.strictEqual(mockRes4.statusCode, 200);
  assert.strictEqual(mockRes4.jsonData.success, true);
  console.log('✅ 6. DELETE /api/tree/person/:id muvaffaqiyatli o\'chirildi.');

  // Test POST /api/tree/reset
  const mockReq5 = { query: { tree_id: 'default' }, user: null };
  const mockRes5 = createMockRes();
  const resetHandler = treeRoutes.stack.find(l => l.route && l.route.path === '/reset' && l.route.methods.post).route.stack[1].handle;
  await resetHandler(mockReq5, mockRes5);
  assert.strictEqual(mockRes5.statusCode, 200);
  assert.strictEqual(mockRes5.jsonData.success, true);
  console.log('✅ 7. POST /api/tree/reset muvaffaqiyatli tiklandi.');

  console.log('\n🎉 Barcha testlar muvaffaqiyatli yakunlandi!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Test xatosi:', err);
  process.exit(1);
});
