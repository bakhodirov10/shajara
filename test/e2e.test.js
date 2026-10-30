const assert = require('assert');

async function runE2ETests() {
  console.log('🚀 Live E2E HTTP testlari boshlanmoqda...\n');
  const BASE = 'http://localhost:3000';

  // 1. Health check
  const healthRes = await fetch(`${BASE}/api/health`);
  assert.strictEqual(healthRes.status, 200);
  const healthJson = await healthRes.json();
  assert.strictEqual(healthJson.status, 'ok');
  console.log('✅ 1. Health check muvaffaqiyatli:', healthJson.system);

  // 2. Index.html rendering
  const indexRes = await fetch(`${BASE}/`);
  assert.strictEqual(indexRes.status, 200);
  const indexHtml = await indexRes.text();
  assert(indexHtml.includes('Mening shajaram'), 'HTMLda sarlavha bo\'lishi kerak');
  assert(indexHtml.includes('server-status-badge'), 'HTMLda server holati bo\'lishi kerak');
  assert(indexHtml.includes('auth-modal'), 'HTMLda auth-modal bo\'lishi kerak');
  console.log('✅ 2. Frontend index.html serverdan to\'g\'ri uzatilmoqda.');

  // 3. GET /api/tree
  const treeRes = await fetch(`${BASE}/api/tree`);
  assert.strictEqual(treeRes.status, 200);
  const treeJson = await treeRes.json();
  assert.strictEqual(treeJson.success, true);
  assert(treeJson.tree.fullName.includes('Normat ota'));
  console.log('✅ 3. GET /api/tree bazadan muvaffaqiyatli olindi. Bosh ajdod:', treeJson.tree.fullName);

  // 4. POST /api/tree/child
  const addChildRes = await fetch(`${BASE}/api/tree/child`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parentId: 'p_root',
      child: {
        fullName: 'E2E Test Farzand',
        gender: 'female',
        birthYear: 1975,
        spouse: 'E2E Test Kuyov'
      }
    })
  });
  assert.strictEqual(addChildRes.status, 201);
  const addChildJson = await addChildRes.json();
  assert.strictEqual(addChildJson.success, true);
  const createdChildId = addChildJson.child.id;
  console.log('✅ 4. POST /api/tree/child yangi a\'zo yaratdi:', createdChildId);

  // 5. PUT /api/tree/person/:id
  const editRes = await fetch(`${BASE}/api/tree/person/${createdChildId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'E2E Yangilangan Farzand',
      birthYear: 1976,
      spouse: 'E2E Yangi Kuyov'
    })
  });
  assert.strictEqual(editRes.status, 200);
  const editJson = await editRes.json();
  assert.strictEqual(editJson.person.fullName, 'E2E Yangilangan Farzand');
  console.log('✅ 5. PUT /api/tree/person/:id muvaffaqiyatli tahrirlandi.');

  // 6. DELETE /api/tree/person/:id
  const deleteRes = await fetch(`${BASE}/api/tree/person/${createdChildId}`, {
    method: 'DELETE'
  });
  assert.strictEqual(deleteRes.status, 200);
  const deleteJson = await deleteRes.json();
  assert.strictEqual(deleteJson.success, true);
  console.log('✅ 6. DELETE /api/tree/person/:id a\'zoni o\'chirdi.');

  // 7. POST /api/tree/reset
  const resetRes = await fetch(`${BASE}/api/tree/reset`, { method: 'POST' });
  assert.strictEqual(resetRes.status, 200);
  const resetJson = await resetRes.json();
  assert.strictEqual(resetJson.success, true);
  console.log('✅ 7. POST /api/tree/reset namunaviy holatga tikladi.');

  // 8. Auth: Login with demo user
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'anvar_qodirov',
      password: '123456'
    })
  });
  assert.strictEqual(loginRes.status, 200);
  const loginJson = await loginRes.json();
  assert(loginJson.token, 'Token qaytishi kerak');
  console.log('✅ 8. POST /api/auth/login demo user (anvar_qodirov) bilan muvaffaqiyatli kirdi.');

  // 9. Auth: GET /api/auth/me
  const meRes = await fetch(`${BASE}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${loginJson.token}` }
  });
  assert.strictEqual(meRes.status, 200);
  const meJson = await meRes.json();
  assert.strictEqual(meJson.user.username, 'anvar_qodirov');
  console.log('✅ 9. GET /api/auth/me profil ma\'lumotlarini tasdiqladi:', meJson.user.full_name);

  // 10. Auth: Register new test user
  const testUsername = `user_${Date.now()}`;
  const regRes = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: testUsername,
      full_name: 'Test Yangi Foydalanuvchi',
      password: 'password123'
    })
  });
  assert.strictEqual(regRes.status, 201);
  const regJson = await regRes.json();
  assert(regJson.token);
  console.log('✅ 10. POST /api/auth/register yangi foydalanuvchi yaratdi:', testUsername);

  // 11. User specific tree test
  const userTreeRes = await fetch(`${BASE}/api/tree`, {
    headers: { 'Authorization': `Bearer ${regJson.token}` }
  });
  assert.strictEqual(userTreeRes.status, 200);
  const userTreeJson = await userTreeRes.json();
  assert.strictEqual(userTreeJson.tree_id, `user_${regJson.user.id}`);
  console.log('✅ 11. Foydalanuvchining shaxsiy shajarasi yaratildi va yuklandi:', userTreeJson.tree_id);

  console.log('\n🌟 Barcha 11 ta Live E2E testlar a\'lo darajada o\'tdi!');
  process.exit(0);
}

runE2ETests().catch(err => {
  console.error('❌ E2E testda xatolik:', err);
  process.exit(1);
});
