/**
 * Shajara.uz - Asosiy Ilova Skripti (Multi-child Family Tree Support)
 */

const API_BASE = '/api';

const state = {
  token: localStorage.getItem('shajara_token') || null,
  currentUser: null,
  activeUser: null,
  isOwner: false,
  members: [],
  stats: {},
  currentView: 'cards',    // 'cards', 'tree', 'timeline', 'explore', 'wisdom', 'certificate'
  cardsSubView: 'branches', // 'branches' (Oila shoxlari) yoki 'lineage' (7-avlod zanjiri)
  searchQuery: '',
  treeMemberFilter: '',
  treeViewInstance: null,
  editingMemberId: null,
  quickAddTargetId: null,
  quickAddRelation: 'child',
};

// 7 ta Avlod standart ma'lumotlari
const DEFAULT_PRESETS = [
  { level: 1, title: "1-avlod: O'zim (Farzand)", role: "Farzand / Nasl davomchisi", icon: "🌱" },
  { level: 2, title: "2-avlod: Ota-Ona", role: "Padari buzrukvor va ona", icon: "🛡️" },
  { level: 3, title: "3-avlod: Bobo-Buvi", role: "Katta ota va katta ona", icon: "📜" },
  { level: 4, title: "4-avlod: Katta bobo", role: "Boboning otasi", icon: "🏛️" },
  { level: 5, title: "5-avlod: Bobokalon", role: "5-ajdod", icon: "👑" },
  { level: 6, title: "6-avlod: Pusht", role: "Tog'oyi bobo / Pushti kamar", icon: "⚔️" },
  { level: 7, title: "7-avlod: Urvoq / Arvoh", role: "7-avlod bosh poydevori", icon: "🦅" }
];

async function apiRequest(endpoint, options = {}) {
  const headers = options.headers || {};
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }
  if (!options.isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const config = {
    ...options,
    headers
  };

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, config);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Xatolik yuz berdi');
    }
    return data;
  } catch (err) {
    showToast(err.message, 'error');
    throw err;
  }
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const bg = type === 'error' ? 'bg-rose-600' : (type === 'info' ? 'bg-amber-600' : 'bg-emerald-600');
  toast.className = `flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-white ${bg} text-sm font-medium transform transition-all duration-300 translate-y-2 opacity-0 z-50`;
  toast.innerHTML = `
    <span>${type === 'error' ? '⚠️' : '✨'}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();

  if (state.token) {
    try {
      const res = await apiRequest('/auth/me');
      state.currentUser = res.user;
      updateAuthUI();
      await loadMyShajara();
    } catch (e) {
      logout(false);
      await loadExploreUsers();
    }
  } else {
    updateAuthUI();
    await viewUserProfile('anvar_qodirov');
  }

  initTreeComponent();
});

function initTreeComponent() {
  const treeContainer = document.getElementById('tree-canvas-container');
  if (treeContainer && window.ShajaraTreeView) {
    state.treeViewInstance = new ShajaraTreeView('tree-canvas-container', {
      onNodeClick: (member) => openMemberDetailsModal(member),
      onAddChildClick: (member) => openQuickAddModal(member.id, 'child')
    });
  }
}

function updateAuthUI() {
  const loggedInDiv = document.getElementById('user-logged-in-menu');
  const loggedOutDiv = document.getElementById('user-logged-out-menu');
  const navMyTreeBtn = document.getElementById('tab-btn-cards');
  const addBtnHeader = document.getElementById('btn-header-add-member');

  if (state.currentUser) {
    if (loggedInDiv) loggedInDiv.classList.remove('hidden');
    if (loggedOutDiv) loggedOutDiv.classList.add('hidden');
    if (navMyTreeBtn) navMyTreeBtn.innerHTML = `<span>🌳</span> Mening Shajaram`;
    if (addBtnHeader) addBtnHeader.classList.remove('hidden');

    const nameEl = document.getElementById('header-user-name');
    if (nameEl) nameEl.textContent = state.currentUser.full_name.split(' ')[0];

    const avatarEl = document.getElementById('header-user-avatar');
    if (avatarEl) {
      avatarEl.src = state.currentUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80';
    }
  } else {
    if (loggedInDiv) loggedInDiv.classList.add('hidden');
    if (loggedOutDiv) loggedOutDiv.classList.remove('hidden');
    if (navMyTreeBtn) navMyTreeBtn.innerHTML = `<span>🌳</span> Namunaviy Shajara`;
    if (addBtnHeader) addBtnHeader.classList.add('hidden');
  }
}

async function loadMyShajara() {
  if (!state.currentUser) {
    openAuthModal('login');
    return;
  }

  try {
    const res = await apiRequest('/shajara/my');
    state.members = res.members || [];
    state.stats = res.stats || {};
    state.activeUser = state.currentUser;
    state.isOwner = true;

    hideVisitorBanner();
    renderActiveView();
    renderStatsBar();
  } catch (err) {
    console.error('Shajarani yuklashda xatolik:', err);
  }
}

async function viewUserProfile(username) {
  try {
    const res = await apiRequest(`/explore/user/${username}`);
    state.members = res.members || [];
    state.stats = res.stats || {};
    state.activeUser = res.user;
    state.isOwner = !!res.is_owner;

    if (!state.isOwner) {
      showVisitorBanner(res.user);
    } else {
      hideVisitorBanner();
    }

    if (state.currentView === 'explore') {
      switchView('cards');
    } else {
      renderActiveView();
    }
    renderStatsBar();
  } catch (err) {
    console.error('Foydalanuvchini ko\'rishda xatolik:', err);
  }
}

function showVisitorBanner(targetUser) {
  const banner = document.getElementById('visitor-banner');
  const bannerText = document.getElementById('visitor-banner-text');
  if (banner && bannerText) {
    banner.classList.remove('hidden');
    bannerText.innerHTML = `
      <span class="inline-block mr-2 text-amber-400">👀</span>
      Siz hozir <strong class="text-white">${targetUser.full_name}</strong> (@${targetUser.username}) ning shajarasini ko'rmoqdasiz. 
      <span class="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30 ml-2">Faqat ko'rish rejimi</span>
    `;
  }
}

function hideVisitorBanner() {
  const banner = document.getElementById('visitor-banner');
  if (banner) banner.classList.add('hidden');
}

function renderStatsBar() {
  const bar = document.getElementById('tree-stats-bar');
  if (!bar) return;

  const total = state.members.length;
  const maxGen = state.stats.max_generation || (state.members.length > 0 ? Math.max(...state.members.map(m => m.generation_level)) : 0);
  const alive = state.stats.alive_count || state.members.filter(m => m.is_alive).length;
  const passed = state.stats.passed_count || state.members.filter(m => !m.is_alive).length;

  bar.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-4 py-3.5 px-6 glass-panel rounded-2xl mb-6 border border-emerald-500/20">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-lg">
          🌳
        </div>
        <div>
          <h2 class="text-base font-bold text-white flex items-center gap-2">
            ${state.activeUser ? state.activeUser.full_name : "Shajara"} 
            ${state.isOwner ? '<span class="text-[10px] text-emerald-300 bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-500/30">Mening Shajaram</span>' : '<span class="text-[10px] text-amber-300 bg-amber-950 px-2 py-0.5 rounded-full border border-amber-500/30">Mehmon rejimi</span>'}
          </h2>
          <p class="text-xs text-slate-400">${state.activeUser?.location || "O'zbekiston"} • ${state.activeUser?.bio || ''}</p>
        </div>
      </div>

      <div class="flex items-center gap-5 text-xs sm:text-sm">
        <div class="text-center">
          <div class="text-[11px] text-slate-400">Jami A'zolar</div>
          <div class="text-base sm:text-lg font-bold text-emerald-400">${total} kishi</div>
        </div>
        <div class="h-8 w-px bg-slate-700/50"></div>
        <div class="text-center">
          <div class="text-[11px] text-slate-400">Avlod Chuqurligi</div>
          <div class="text-base sm:text-lg font-bold text-amber-400">${maxGen} avlod</div>
        </div>
        <div class="h-8 w-px bg-slate-700/50 hidden sm:block"></div>
        <div class="text-center hidden sm:block">
          <div class="text-[11px] text-slate-400">Hayot / Marhum</div>
          <div class="text-sm font-semibold text-slate-300">
            <span class="text-emerald-400">${alive}</span> / <span class="text-slate-400">${passed}</span>
          </div>
        </div>

        ${state.isOwner ? `
          <div class="flex items-center gap-2 ml-2">
            <button onclick="openMemberModal()" class="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-900/40 transition-all flex items-center gap-1.5">
              <span>➕</span> Yangi Shaxs
            </button>
          </div>
        ` : `
          <button onclick="loadMyShajara()" class="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5">
            <span>⬅️</span> Mening Shajaram
          </button>
        `}
      </div>
    </div>
  `;
}

function switchView(viewName) {
  state.currentView = viewName;

  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.classList.remove('bg-emerald-500/20', 'text-emerald-400', 'border-emerald-500/40');
    btn.classList.add('text-slate-300', 'border-transparent');
  });

  const activeBtn = document.getElementById(`tab-btn-${viewName}`);
  if (activeBtn) {
    activeBtn.classList.add('bg-emerald-500/20', 'text-emerald-400', 'border-emerald-500/40');
    activeBtn.classList.remove('text-slate-300', 'border-transparent');
  }

  const views = ['cards', 'tree', 'timeline', 'explore', 'wisdom', 'certificate'];
  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) {
      if (v === viewName) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }
  });

  renderActiveView();
}

function switchCardsSubView(subView) {
  state.cardsSubView = subView;
  render7GenerationsCards();
}

function renderActiveView() {
  switch (state.currentView) {
    case 'cards':
      render7GenerationsCards();
      break;
    case 'tree':
      if (state.treeViewInstance) {
        state.treeViewInstance.setMembers(state.members);
      }
      break;
    case 'timeline':
      renderTimelineView();
      break;
    case 'explore':
      loadExploreUsers();
      break;
    case 'certificate':
      renderCertificateView();
      break;
  }
}

// 1. Asosiy Ko'rinish: Oila Shoxlari (Ota-Ona va Farzandlar)
function render7GenerationsCards() {
  const container = document.getElementById('generations-cards-container');
  if (!container) return;

  if (state.members.length === 0) {
    container.innerHTML = `
      <div class="text-center py-16 glass-panel rounded-3xl p-8 max-w-2xl mx-auto border border-emerald-500/30">
        <div class="text-6xl mb-4">🌳</div>
        <h3 class="text-2xl font-bold text-white mb-2 font-heritage">Shajarangiz Hali Bo'sh</h3>
        <p class="text-slate-400 text-sm mb-6 leading-relaxed">
          O'zingizdan boshlab ota-onangiz va aka-ukalaringizni shajaraga kiriting.
        </p>
        <button onclick="openMemberModal(null, 1)" class="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold rounded-2xl shadow-xl transition-all">
          ➕ O'zimni kiritish
        </button>
      </div>
    `;
    return;
  }

  // Sub-view toggle (Oila Shoxlari vs 7-Avlod Zanjiri) va Tezkor Qidiruv
  let html = `
    <div class="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 pb-3 border-b border-slate-800">
      <div class="flex items-center gap-2">
        <button onclick="switchCardsSubView('branches')" class="px-4 py-2 rounded-xl text-xs font-bold transition-all ${state.cardsSubView === 'branches' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'}">
          👨‍👩‍👧‍👦 Oila Shoxlari (Ota-Ona va Bolalar)
        </button>
        <button onclick="switchCardsSubView('lineage')" class="px-4 py-2 rounded-xl text-xs font-bold transition-all ${state.cardsSubView === 'lineage' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'}">
          📜 7 Avlod Zanjiri
        </button>
      </div>

      <div class="flex items-center gap-3 w-full sm:w-auto">
        <div class="relative flex-1 sm:w-64">
          <input 
            id="tree-members-search" 
            type="text" 
            oninput="handleTreeMemberFilter(this.value)" 
            value="${state.treeMemberFilter || ''}" 
            placeholder="Shajaradan a'zo qidirish..." 
            class="w-full pl-8 pr-7 py-2 bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none"
          />
          <span class="absolute left-2.5 top-2.5 text-xs text-slate-400">🔍</span>
          ${state.treeMemberFilter ? `<button onclick="handleTreeMemberFilter(''); render7GenerationsCards();" class="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-white">✕</button>` : ''}
        </div>
      </div>
    </div>
  `;

  if (state.cardsSubView === 'branches') {
    html += renderFamilyBranchesView();
  } else {
    html += renderLinear7Generations();
  }

  container.innerHTML = html;
  if (state.treeMemberFilter) {
    applyMemberCardHighlights();
  }
}

function handleTreeMemberFilter(val) {
  state.treeMemberFilter = (val || '').trim().toLowerCase();
  applyMemberCardHighlights();
}

function applyMemberCardHighlights() {
  const cards = document.querySelectorAll('.member-card');
  const q = state.treeMemberFilter;

  cards.forEach(card => {
    const text = (card.dataset.memberText || card.innerText || '').toLowerCase();
    if (!q) {
      card.classList.remove('ring-2', 'ring-amber-400', 'border-amber-400', 'scale-[1.02]', 'opacity-30', 'grayscale-[50%]');
    } else if (text.includes(q)) {
      card.classList.add('ring-2', 'ring-amber-400', 'border-amber-400', 'scale-[1.02]');
      card.classList.remove('opacity-30', 'grayscale-[50%]');
    } else {
      card.classList.remove('ring-2', 'ring-amber-400', 'border-amber-400', 'scale-[1.02]');
      card.classList.add('opacity-30', 'grayscale-[50%]');
    }
  });
}

// Oila Birliklari (Family Units: Parents + Multiple Children)
function renderFamilyBranchesView() {
  // Oila birliklarini aniqlash:
  // Har bir ota yoki ona va ularning bolalari
  const couples = [];
  const handledParentIds = new Set();

  // 1. Er-xotin juftliklarini aniqlash
  state.members.forEach(m => {
    if (m.spouse_id && !handledParentIds.has(m.id)) {
      const spouse = state.members.find(s => s.id === m.spouse_id);
      if (spouse) {
        const father = m.gender === 'female' ? spouse : m;
        const mother = m.gender === 'female' ? m : spouse;

        // Ushbu ota-onaning barcha bolalari
        const children = state.members.filter(c => 
          (c.parent_id === father.id || c.parent_id === mother.id || c.mother_id === mother.id || c.mother_id === father.id)
        );

        couples.push({
          type: 'couple',
          father,
          mother,
          primaryParent: father,
          children: children,
          genLevel: father.generation_level
        });

        handledParentIds.add(father.id);
        handledParentIds.add(mother.id);
      }
    }
  });

  // 2. Turmush o'rtog'i ko'rsatilmagan, lekin bolalari bor shaxslar
  state.members.forEach(m => {
    if (!handledParentIds.has(m.id)) {
      const children = state.members.filter(c => c.parent_id === m.id || c.mother_id === m.id);
      if (children.length > 0) {
        couples.push({
          type: 'single',
          primaryParent: m,
          father: m.gender === 'male' ? m : null,
          mother: m.gender === 'female' ? m : null,
          children: children,
          genLevel: m.generation_level
        });
        handledParentIds.add(m.id);
      }
    }
  });

  // 3. Hali bolalari bo'lmagan mustaqil shaxslar / yoshlar
  const singlesWithoutChildren = state.members.filter(m => !handledParentIds.has(m.id) && !m.spouse_id);

  // Avlod darajasi bo'yicha saralash (katta avlodlar yuqorida: 3, 2, 1)
  couples.sort((a, b) => b.genLevel - a.genLevel);

  let html = `<div class="space-y-8 max-w-5xl mx-auto">`;

  couples.forEach((group, gIdx) => {
    const parent = group.primaryParent;
    const father = group.father;
    const mother = group.mother;
    const children = group.children;
    const titleText = father && mother 
      ? `${father.first_name} va ${mother.first_name} Xonadoni`
      : `${parent.first_name} ${parent.last_name || ''} Oila Shoxi`;

    html += `
      <!-- OILA BLOKI -->
      <div class="glass-panel rounded-3xl p-6 sm:p-7 border border-emerald-500/30 relative overflow-hidden shadow-2xl">
        <!-- Oila sarlavhasi -->
        <div class="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-800">
          <div class="flex items-center gap-3">
            <span class="text-2xl">👨‍👩‍👧‍👦</span>
            <div>
              <h3 class="text-lg font-bold text-white font-heritage flex items-center gap-2">
                ${titleText}
                <span class="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-0.5 rounded-full font-sans">
                  ${parent.generation_level}-avlod
                </span>
              </h3>
              <p class="text-xs text-slate-400">
                ${children.length} nafar bola (farzand) ro'yxatga olingan
              </p>
            </div>
          </div>

          ${state.isOwner ? `
            <!-- Ushbu oilaga yangi bola qo'shish tugmasi -->
            <button onclick="openQuickAddModal(${parent.id}, 'child')" class="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-950 transition-all flex items-center gap-1.5">
              <span>👶</span> + Yangi Bola (Farzand) Qo'shish
            </button>
          ` : ''}
        </div>

        <!-- 1. OTA VA ONA (OTA-ONA BLOKI) -->
        <div class="mb-6">
          <div class="text-[11px] uppercase tracking-wider text-amber-400 font-bold mb-2">
            🛡️ Ota-Ona:
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            ${father ? renderPersonMiniCard(father, 'Ota') : ''}
            ${mother ? renderPersonMiniCard(mother, 'Ona') : `
              ${state.isOwner && father ? `
                <div class="border-2 border-dashed border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3 bg-slate-900/40">
                  <div class="text-xs text-slate-400">Ona (Turmush o'rtoq) kiritilmagan</div>
                  <button onclick="openQuickAddModal(${father.id}, 'spouse')" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-semibold">
                    💍 + Rafiqasini qo'shish
                  </button>
                </div>
              ` : ''}
            `}
          </div>
        </div>

        <!-- 2. BOLALARI (3 yoki 4 ta bola...) -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <div class="text-[11px] uppercase tracking-wider text-emerald-400 font-bold">
              🌱 Farzandlari (${children.length} ta bola):
            </div>
            ${state.isOwner ? `
              <button onclick="openQuickAddModal(${parent.id}, 'child')" class="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1">
                <span>➕</span> Bola qo'shish
              </button>
            ` : ''}
          </div>

          ${children.length > 0 ? `
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-${Math.min(children.length, 4)} gap-3">
              ${children.map((ch, chIdx) => renderChildCard(ch, chIdx + 1)).join('')}
            </div>
          ` : `
            <div class="border-2 border-dashed border-slate-800 rounded-2xl p-6 text-center bg-slate-950/30">
              <p class="text-xs text-slate-400 mb-2">Hozircha ushbu ota-onaga bolalar kiritilmagan.</p>
              ${state.isOwner ? `
                <button onclick="openQuickAddModal(${parent.id}, 'child')" class="px-4 py-2 bg-slate-800 hover:bg-emerald-950 text-emerald-400 border border-emerald-500/40 rounded-xl text-xs font-bold transition-all">
                  👶 1-bolani qo'shish
                </button>
              ` : ''}
            </div>
          `}
        </div>

      </div>
    `;
  });

  // Hali oilasi yo'q boshqa a'zolar
  if (singlesWithoutChildren.length > 0) {
    html += `
      <div class="glass-panel rounded-3xl p-6 border border-slate-800">
        <h4 class="text-sm font-bold text-slate-300 mb-4">Qo'shimcha Ajdodlar va Shaxslar</h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          ${singlesWithoutChildren.map(m => renderPersonMiniCard(m, m.generation_title)).join('')}
        </div>
      </div>
    `;
  }

  html += `</div>`;
  return html;
}

// Shaxsning ixcham kartochkasi (Ota yoki Ona)
function renderPersonMiniCard(member, roleBadge) {
  const isFemale = member.gender === 'female';
  const years = (member.birth_year || member.death_year)
    ? `${member.birth_year || '...'} — ${member.is_alive ? 'Hozir' : (member.death_year || '...')}`
    : '';
  const memberSearchText = `${member.first_name} ${member.last_name || ''} ${member.profession || ''} ${member.birth_year || ''} ${member.birth_place || ''} ${roleBadge || ''}`.toLowerCase();

  return `
    <div class="glass-card member-card rounded-2xl p-4 border ${isFemale ? 'border-pink-500/30' : 'border-amber-500/30'} flex items-start gap-3.5 transition-all duration-300" data-member-text="${memberSearchText}">
      <img 
        src="${member.photo_url || (isFemale ? 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80' : 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80')}" 
        class="w-14 h-14 rounded-xl object-cover border ${isFemale ? 'border-pink-400/50' : 'border-amber-400/50'} shrink-0" 
      />
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between gap-1 mb-0.5">
          <h4 class="text-sm font-bold text-white truncate cursor-pointer hover:text-amber-300" onclick="openMemberDetailsModalById(${member.id})">
            ${member.first_name} ${member.last_name || ''}
          </h4>
          <span class="text-[10px] ${isFemale ? 'bg-pink-950 text-pink-300 border-pink-500/30' : 'bg-amber-950 text-amber-300 border-amber-500/30'} border px-2 py-0.5 rounded-full font-bold">
            ${roleBadge || (isFemale ? 'Ona' : 'Ota')}
          </span>
        </div>
        <p class="text-[11px] text-slate-300">${member.profession || member.patronymic || ''}</p>
        <p class="text-[10px] text-slate-400">${years} ${member.birth_place ? `• 📍 ${member.birth_place}` : ''}</p>

        <!-- Amallar -->
        <div class="flex items-center gap-2 mt-2 pt-1.5 border-t border-slate-800/60">
          <button onclick="openMemberDetailsModalById(${member.id})" class="text-[11px] text-slate-300 hover:text-white">Batafsil</button>
          ${state.isOwner ? `
            <button onclick="openQuickAddModal(${member.id}, 'child')" class="text-[11px] text-emerald-400 hover:underline">👶 + Bola</button>
            <button onclick="openMemberModal(${member.id})" class="text-[11px] text-amber-400 hover:underline">✏️ Tahrir</button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

// Bolaning kartochkasi (Child Card: 1-bola, 2-bola, 3-bola, 4-bola...)
function renderChildCard(child, indexNum) {
  const isFemale = child.gender === 'female';
  const isSelf = child.relation_type === 'self';
  const childTitle = `${indexNum}-farzand: ${isFemale ? 'Qiz' : 'O\'g\'il'}`;
  const childSearchText = `${child.first_name} ${child.last_name || ''} ${child.profession || ''} ${child.birth_year || ''} ${childTitle}`.toLowerCase();

  return `
    <div class="bg-slate-900/90 member-card rounded-2xl p-3.5 border ${isSelf ? 'border-emerald-400 shadow-lg shadow-emerald-950/60' : 'border-slate-800'} flex flex-col justify-between transition-all duration-300" data-member-text="${childSearchText}">
      <div>
        <div class="flex items-center justify-between gap-1 mb-2">
          <span class="text-[10px] font-bold ${isSelf ? 'bg-emerald-900 text-emerald-300' : 'bg-slate-800 text-slate-400'} px-2 py-0.5 rounded-md">
            ${isSelf ? '★ O\'zim' : childTitle}
          </span>
          <span class="text-[10px] ${child.is_alive ? 'text-emerald-400' : 'text-slate-500'}">
            ${child.is_alive ? '● Hayot' : '✝ Marhum'}
          </span>
        </div>

        <div class="flex items-center gap-2.5 mb-2">
          <img 
            src="${child.photo_url || (isFemale ? 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=120&q=80' : 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80')}" 
            class="w-10 h-10 rounded-xl object-cover border border-slate-700 shrink-0" 
          />
          <div class="min-w-0 flex-1">
            <h5 class="text-xs font-bold text-white truncate cursor-pointer hover:text-emerald-400" onclick="openMemberDetailsModalById(${child.id})">
              ${child.first_name} ${child.last_name || ''}
            </h5>
            <p class="text-[10px] text-teal-300 truncate">${child.profession || 'Farzand'}</p>
          </div>
        </div>

        <div class="text-[10px] text-slate-400 space-y-0.5 mb-3">
          <div>📅 ${child.birth_year ? `${child.birth_year}-yil` : 'Tug\'ilgan yili noma\'lum'}</div>
          ${child.children_count > 0 ? `<div class="text-amber-300 font-semibold">👶 ${child.children_count} nafar bolasi bor</div>` : ''}
        </div>
      </div>

      <!-- Amallar (Bola qo'shish va Tahrirlash) -->
      <div class="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-1 text-[11px]">
        <button onclick="openMemberDetailsModalById(${child.id})" class="text-slate-400 hover:text-white">
          👁️
        </button>

        ${state.isOwner ? `
          <div class="flex items-center gap-1.5">
            <button onclick="openQuickAddModal(${child.id}, 'child')" title="Ushbu farzandga yangi bola qo'shish" class="px-2 py-1 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/30 rounded-lg text-[10px] font-bold">
              👶 + Bola
            </button>
            <button onclick="openQuickAddModal(${child.id}, 'spouse')" title="Turmush o'rtoq qo'shish" class="px-1.5 py-1 bg-slate-800 hover:bg-slate-700 text-pink-300 rounded-lg text-[10px]">
              💍
            </button>
            <button onclick="openMemberModal(${child.id})" title="Tahrirlash" class="text-slate-400 hover:text-amber-300">
              ✏️
            </button>
            <button onclick="deleteMemberConfirm(${child.id}, '${child.first_name}')" title="O'chirish" class="text-slate-500 hover:text-rose-400">
              🗑️
            </button>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

// 7-Avlod Zanjiri (Oldingi zanjirli ko'rinish)
function renderLinear7Generations() {
  const generationSlots = [];
  for (let lvl = 1; lvl <= 7; lvl++) {
    const preset = DEFAULT_PRESETS.find(p => p.level === lvl);
    const existingInLvl = state.members.filter(m => m.generation_level === lvl);
    generationSlots.push({ level: lvl, preset: preset, members: existingInLvl });
  }

  let html = `<div class="relative max-w-4xl mx-auto flex flex-col items-center">`;
  generationSlots.forEach((slot, index) => {
    html += `
      <div class="w-full flex flex-col items-center relative my-3">
        <div class="flex items-center gap-3 mb-3">
          <span class="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold flex items-center justify-center text-xs">
            ${slot.level}
          </span>
          <span class="font-heritage text-sm font-bold text-gold-gradient">
            ${slot.preset.title}
          </span>
          <span class="text-[11px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700">
            ${slot.preset.role}
          </span>
        </div>

        <div class="w-full grid grid-cols-1 md:grid-cols-${Math.min(slot.members.length || 1, 3)} gap-3">
    `;

    if (slot.members.length > 0) {
      slot.members.forEach(m => {
        html += renderPersonMiniCard(m, m.generation_title);
      });
    } else {
      html += `
        <div class="w-full border-2 border-dashed border-slate-800 rounded-2xl p-4 text-center bg-slate-900/30">
          <p class="text-xs text-slate-500">${slot.preset.title} kiritilmagan</p>
        </div>
      `;
    }

    html += `</div></div>`;
  });
  html += `</div>`;
  return html;
}

// 2. Ro'yxat & Xronologiya
function renderTimelineView() {
  const container = document.getElementById('timeline-container');
  if (!container) return;

  if (state.members.length === 0) {
    container.innerHTML = `<p class="text-center text-slate-400 py-12">Shajarada a'zolar mavjud emas.</p>`;
    return;
  }

  const sorted = [...state.members].sort((a, b) => {
    const yA = parseInt(a.birth_year) || 2000;
    const yB = parseInt(b.birth_year) || 2000;
    return yA - yB;
  });

  let html = `<div class="relative border-l-2 border-emerald-500/40 ml-4 md:ml-32 my-6 space-y-6">`;
  sorted.forEach(m => {
    html += `
      <div class="relative pl-6 group">
        <div class="absolute -left-2 top-1.5 w-4 h-4 rounded-full bg-slate-900 border-2 border-emerald-400 group-hover:bg-amber-400 transition-colors"></div>
        <span class="md:absolute md:-left-28 top-1 text-xs font-bold text-amber-400 bg-slate-800/90 px-2 py-0.5 rounded border border-amber-500/20 mb-2 inline-block">
          ${m.birth_year || 'Noma\'lum'} yil
        </span>

        <div class="glass-card rounded-2xl p-4 border border-slate-700/60 max-w-xl">
          <div class="flex items-center justify-between gap-2 mb-1">
            <h4 class="text-sm font-bold text-white cursor-pointer hover:text-emerald-400" onclick="openMemberDetailsModalById(${m.id})">
              ${m.first_name} ${m.last_name || ''}
            </h4>
            <span class="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
              ${m.generation_title || `${m.generation_level}-avlod`}
            </span>
          </div>
          <div class="text-xs text-slate-300">${m.profession ? `💼 ${m.profession} • ` : ''} 📍 ${m.birth_place || 'Hudud ko\'rsatilmagan'}</div>
        </div>
      </div>
    `;
  });
  html += `</div>`;
  container.innerHTML = html;
}

// 3. Shajaralarni Qidirish (Explore)
async function loadExploreUsers() {
  const container = document.getElementById('explore-users-grid');
  if (!container) return;

  container.innerHTML = `
    <div class="col-span-full text-center py-12 text-slate-400">
      <div class="animate-spin text-3xl mb-2">🌀</div>
      <p>Ochiq shajaralar qidirilmoqda...</p>
    </div>
  `;

  try {
    const q = state.searchQuery ? `?q=${encodeURIComponent(state.searchQuery)}` : '';
    const res = await apiRequest(`/explore/users${q}`);
    const users = res.users || [];

    if (users.length === 0) {
      container.innerHTML = `
        <div class="col-span-full text-center py-12 glass-panel rounded-2xl p-8 border border-slate-700">
          <div class="text-4xl mb-2">🔍</div>
          <h4 class="text-base font-bold text-white mb-1">Hech narsa topilmadi</h4>
        </div>
      `;
      return;
    }

    container.innerHTML = users.map(u => {
      const isCurrentViewing = state.activeUser && state.activeUser.id === u.id;
      const isMyOwn = state.currentUser && state.currentUser.id === u.id;

      return `
        <div class="glass-card rounded-2xl p-5 border ${isCurrentViewing ? 'border-amber-400' : 'border-slate-700/60'} flex flex-col justify-between">
          <div>
            <div class="flex items-start gap-3 mb-3">
              <img src="${u.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&q=80'}" class="w-12 h-12 rounded-2xl object-cover border border-amber-400/40 shrink-0" />
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <h4 class="text-sm font-bold text-white truncate">${u.full_name}</h4>
                  ${isMyOwn ? '<span class="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1 py-0.2 rounded">Siz</span>' : ''}
                </div>
                <p class="text-[11px] text-amber-300/80">@${u.username}</p>
                <p class="text-[11px] text-slate-400 truncate">📍 ${u.location || "O'zbekiston"}</p>
              </div>
            </div>
            <p class="text-xs text-slate-300 line-clamp-2 italic mb-4">"${u.bio || "Oila shajarasi."}"</p>
          </div>

          <div class="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
            <span class="text-xs text-slate-400"><strong class="text-emerald-400">${u.member_count}</strong> ta a'zo</span>
            <button onclick="viewUserProfile('${u.username}')" class="px-3 py-1.5 ${isCurrentViewing ? 'bg-amber-600 text-white' : 'bg-slate-800 hover:bg-emerald-900/80 text-emerald-400 border border-emerald-500/30'} rounded-xl text-xs font-semibold transition-colors">
              ${isCurrentViewing ? 'Ko\'rilmoqda 👀' : 'Shajarani ko\'rish 👁️'}
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<p class="col-span-full text-center text-rose-400 py-8">Xatolik yuz berdi.</p>`;
  }
}

// 4. Diplom (Certificate)
function renderCertificateView() {
  const container = document.getElementById('certificate-render-target');
  if (!container) return;

  const targetName = state.activeUser ? state.activeUser.full_name : "Nasl Sohibi";

  // 7 avlod zanjiri ajdodlarini ajratish (7 dan 1 gacha)
  const lineage = [];
  for (let lvl = 7; lvl >= 1; lvl--) {
    const preset = DEFAULT_PRESETS.find(p => p.level === lvl);
    const inLvl = state.members.filter(m => m.generation_level === lvl);
    const mainPerson = inLvl.find(m => m.gender === 'male' || m.relation_type === 'self') || inLvl[0];
    lineage.push({
      level: lvl,
      preset: preset,
      member: mainPerson,
      countInLevel: inLvl.length
    });
  }

  container.innerHTML = `
    <div class="certificate-frame p-8 sm:p-14 rounded-3xl max-w-4xl mx-auto text-center relative overflow-hidden bg-slate-950/90 border-4 border-amber-500/50 shadow-2xl">
      
      <!-- Oltin Burchak Naqshlari -->
      <div class="absolute top-4 left-4 text-amber-400/50 text-2xl font-serif select-none">❧</div>
      <div class="absolute top-4 right-4 text-amber-400/50 text-2xl font-serif select-none">☙</div>
      <div class="absolute bottom-4 left-4 text-amber-400/50 text-2xl font-serif select-none">❧</div>
      <div class="absolute bottom-4 right-4 text-amber-400/50 text-2xl font-serif select-none">☙</div>

      <div class="mb-6">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-bold uppercase tracking-widest mb-2">
          <span>📜</span> O'zbekiston Milliy Sulolalar Reestri
        </div>
        <h1 class="text-3xl sm:text-5xl font-extrabold text-gold-gradient font-heritage tracking-wider mb-2">
          YETTI AVLOD SHAJARASI
        </h1>
        <p class="text-xs text-amber-200/80 font-serif italic max-w-xl mx-auto">
          "Yetti otasini bilgan inson o'z ildizini asraydi, naslini pok saqlaydi va kelajakka buyuk meros qoldiradi."
        </p>
        <div class="w-48 h-1 bg-gradient-to-r from-transparent via-amber-400 to-transparent mx-auto mt-4 mb-2"></div>
      </div>

      <!-- Shajara Sohibi Faxriy Bloki -->
      <div class="my-6 inline-block bg-gradient-to-b from-amber-950/40 to-slate-900 border-2 border-amber-400/60 rounded-2xl px-8 sm:px-12 py-4 shadow-xl">
        <div class="text-[11px] text-amber-300 font-bold uppercase tracking-wider">Sulola Vorisi & Shajara Egasi:</div>
        <div class="text-2xl sm:text-3xl font-black text-white font-serif-uz mt-1">${targetName}</div>
        <div class="text-xs text-slate-300 mt-1">📍 ${state.activeUser?.location || "O'zbekiston"} • Jami <strong>${state.members.length}</strong> nafar sulola a'zosi qayd etilgan</div>
      </div>

      <!-- 7 AVLODNING MUQADDAS ZANJIRI -->
      <div class="my-8">
        <h4 class="text-xs uppercase font-bold tracking-widest text-amber-400 mb-4 flex items-center justify-center gap-2">
          <span>👑</span> 7 Avlod Muqaddas Zanjiri (Yetti Pusht) <span>👑</span>
        </h4>

        <div class="space-y-2.5 max-w-2xl mx-auto">
          ${lineage.map((item) => {
            const m = item.member;
            const years = m ? (m.birth_year ? `${m.birth_year}-y.` : '') : '';
            return `
              <div class="flex items-center justify-between p-3.5 rounded-2xl bg-slate-900/90 border border-amber-500/30 hover:border-amber-400 transition-colors">
                <div class="flex items-center gap-3.5">
                  <span class="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center justify-center font-bold text-xs shrink-0">
                    ${item.level}
                  </span>
                  <div class="text-left">
                    <span class="text-[10px] text-amber-400/90 font-bold uppercase tracking-wide block">${item.preset ? item.preset.title : `${item.level}-avlod`}</span>
                    <strong class="text-sm font-bold text-white">${m ? `${m.first_name} ${m.last_name || ''} ${m.patronymic ? `(${m.patronymic})` : ''}` : `<span class="text-slate-500 italic">Kiritilmagan</span>`}</strong>
                  </div>
                </div>
                <div class="text-right text-xs">
                  <div class="text-amber-300 font-semibold">${years}</div>
                  <div class="text-[11px] text-slate-400">${m?.profession || ''}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Muhr va Rasmiy Tasdiq -->
      <div class="mt-10 pt-6 border-t-2 border-amber-500/30 flex flex-wrap items-center justify-between gap-6 text-xs text-slate-400 px-4">
        <div class="text-left">
          <div>Rasmiy ro'yxatga olingan sana:</div>
          <strong class="text-white text-sm">${new Date().toLocaleDateString('uz-UZ', { year: 'numeric', month: 'long', day: 'numeric' })}</strong>
          <div class="text-[10px] text-slate-500 mt-0.5">Hujjat kodi: SHJ-${state.activeUser ? state.activeUser.id : 1}-${Date.now().toString().slice(-6)}</div>
        </div>

        <!-- Rasmiy Ramziy Muhr -->
        <div class="w-24 h-24 rounded-full border-2 border-dashed border-amber-400/80 flex flex-col items-center justify-center text-amber-300 text-[8px] font-bold p-1 bg-amber-950/20 shadow-inner">
          <span class="tracking-widest">SHAJARA.UZ</span>
          <span class="text-2xl my-0.5">🌳</span>
          <span class="text-[8px] uppercase tracking-wider text-amber-400">TASDIQLANGAN</span>
          <span class="text-[7px] text-slate-400">MILLIY SOLNOMA</span>
        </div>

        <div class="text-right">
          <div class="font-heritage text-lg font-bold text-gold-gradient">Shajara.uz Portali</div>
          <div class="text-slate-400 text-xs">Milliy Genealogiya Tizimi</div>
          <div class="text-[10px] text-emerald-400 font-semibold mt-1">● Raqamli Guvohnoma Faol</div>
        </div>
      </div>

    </div>
  `;
}

// ==================== TEZKOR BOLA / TURMUSH O'RTOQ QO'SHISH (QUICK ADD) ====================
function openQuickAddModal(targetId, relation = 'child') {
  if (!state.isOwner) {
    showToast('Faqat shajara egasi a\'zo qo\'sha oladi!', 'error');
    return;
  }

  const target = state.members.find(m => m.id === targetId);
  if (!target) return;

  state.quickAddTargetId = targetId;
  state.quickAddRelation = relation;

  const modal = document.getElementById('quick-add-modal');
  const title = document.getElementById('quick-add-title');
  const desc = document.getElementById('quick-add-desc');
  const form = document.getElementById('quick-add-form');

  if (!modal || !form) return;
  form.reset();

  if (document.getElementById('qa-photo-url')) document.getElementById('qa-photo-url').value = '';
  if (document.getElementById('qa-photo-file')) document.getElementById('qa-photo-file').value = '';
  if (document.getElementById('qa-photo-status')) document.getElementById('qa-photo-status').textContent = '';

  if (relation === 'child') {
    title.innerHTML = `👶 Yangi Bola (Farzand) Qo'shish`;
    desc.innerHTML = `<strong>${target.first_name} ${target.last_name || ''}</strong> ning farzandini kiritish:`;
    document.getElementById('qa-gender').value = 'male';
  } else if (relation === 'spouse') {
    title.innerHTML = `💍 Turmush O'rtog'i Qo'shish`;
    desc.innerHTML = `<strong>${target.first_name} ${target.last_name || ''}</strong> ning turmush o'rtog'i:`;
    document.getElementById('qa-gender').value = target.gender === 'male' ? 'female' : 'male';
  }

  modal.classList.remove('hidden');
}

function closeQuickAddModal() {
  const modal = document.getElementById('quick-add-modal');
  if (modal) modal.classList.add('hidden');
  state.quickAddTargetId = null;
}

async function handleQuickAddSubmit(e) {
  e.preventDefault();
  if (!state.isOwner || !state.quickAddTargetId) return;

  const payload = {
    target_id: state.quickAddTargetId,
    relation: state.quickAddRelation,
    first_name: document.getElementById('qa-first-name').value,
    last_name: document.getElementById('qa-last-name').value,
    gender: document.getElementById('qa-gender').value,
    birth_year: document.getElementById('qa-birth-year').value,
    profession: document.getElementById('qa-profession').value,
    photo_url: document.getElementById('qa-photo-url')?.value?.trim() || '',
    is_alive: document.getElementById('qa-is-alive').checked ? 1 : 0
  };

  try {
    const res = await apiRequest('/shajara/quick-add', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    showToast(res.message, 'success');
    closeQuickAddModal();
    await loadMyShajara();
  } catch (err) {
    console.error('Quick add xatosi:', err);
  }
}

// O'chirish
function deleteMemberConfirm(memberId, name) {
  if (!state.isOwner) return;
  if (confirm(`Haqiqatan ham "${name}"ni shajaradan o'chirmoqchimisiz?`)) {
    deleteMember(memberId);
  }
}

async function deleteMember(memberId) {
  try {
    const res = await apiRequest(`/shajara/member/${memberId}`, { method: 'DELETE' });
    showToast(res.message, 'success');
    await loadMyShajara();
  } catch (err) {
    console.error('O\'chirish xatosi:', err);
  }
}

// Umumiy Member Modali
function openMemberModal(memberId = null, prefillLevel = 1) {
  if (!state.isOwner) {
    showToast('Faqat shajara egasi ma\'lumot qo\'sha oladi!', 'error');
    return;
  }

  state.editingMemberId = memberId;
  const modal = document.getElementById('member-modal');
  const title = document.getElementById('member-modal-title');
  const form = document.getElementById('member-form');

  if (!modal || !form) return;
  form.reset();

  const parentSelect = document.getElementById('field-parent-id');
  if (parentSelect) {
    parentSelect.innerHTML = `<option value="">-- Otasi (Ixtiyoriy) --</option>`;
    state.members.filter(m => m.gender === 'male').forEach(m => {
      if (!memberId || m.id !== memberId) {
        parentSelect.innerHTML += `<option value="${m.id}">${m.generation_level}-avlod: ${m.first_name} ${m.last_name || ''}</option>`;
      }
    });
  }

  const uploadStatus = document.getElementById('upload-photo-status');
  if (uploadStatus) uploadStatus.textContent = '';
  const photoFileInput = document.getElementById('field-photo-file');
  if (photoFileInput) photoFileInput.value = '';

  if (memberId) {
    const member = state.members.find(m => m.id === memberId);
    if (!member) return;

    title.textContent = `Tahrirlash: ${member.first_name} ${member.last_name || ''}`;
    document.getElementById('field-first-name').value = member.first_name || '';
    document.getElementById('field-last-name').value = member.last_name || '';
    document.getElementById('field-patronymic').value = member.patronymic || '';
    document.getElementById('field-gender').value = member.gender || 'male';
    document.getElementById('field-generation-level').value = member.generation_level || 1;
    document.getElementById('field-generation-title').value = member.generation_title || '';
    document.getElementById('field-is-alive').checked = !!member.is_alive;
    document.getElementById('field-birth-year').value = member.birth_year || '';
    document.getElementById('field-death-year').value = member.death_year || '';
    document.getElementById('field-birth-place').value = member.birth_place || '';
    document.getElementById('field-profession').value = member.profession || '';
    document.getElementById('field-title-honor').value = member.title_honor || '';
    document.getElementById('field-photo-url').value = member.photo_url || '';
    document.getElementById('field-bio').value = member.bio || '';
    if (parentSelect && member.parent_id) {
      parentSelect.value = member.parent_id;
    }
  } else {
    title.textContent = `Yangi Shaxs Qo'shish`;
    document.getElementById('field-generation-level').value = prefillLevel;
    document.getElementById('field-is-alive').checked = true;
  }

  modal.classList.remove('hidden');
}

function closeMemberModal() {
  const modal = document.getElementById('member-modal');
  if (modal) modal.classList.add('hidden');
  state.editingMemberId = null;
}

async function handleMemberFormSubmit(e) {
  e.preventDefault();
  if (!state.isOwner) return;

  const payload = {
    first_name: document.getElementById('field-first-name').value,
    last_name: document.getElementById('field-last-name').value,
    patronymic: document.getElementById('field-patronymic').value,
    gender: document.getElementById('field-gender').value,
    generation_level: parseInt(document.getElementById('field-generation-level').value) || 1,
    generation_title: document.getElementById('field-generation-title').value,
    is_alive: document.getElementById('field-is-alive').checked ? 1 : 0,
    birth_year: document.getElementById('field-birth-year').value,
    death_year: document.getElementById('field-death-year').value,
    birth_place: document.getElementById('field-birth-place').value,
    profession: document.getElementById('field-profession').value,
    title_honor: document.getElementById('field-title-honor').value,
    photo_url: document.getElementById('field-photo-url').value,
    bio: document.getElementById('field-bio').value,
    parent_id: document.getElementById('field-parent-id').value || null
  };

  try {
    if (state.editingMemberId) {
      const res = await apiRequest(`/shajara/member/${state.editingMemberId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showToast(res.message, 'success');
    } else {
      const res = await apiRequest(`/shajara/member`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast(res.message, 'success');
    }

    closeMemberModal();
    await loadMyShajara();
  } catch (err) {
    console.error('Saqlash xatosi:', err);
  }
}

// Batafsil modal
function openMemberDetailsModalById(memberId) {
  const member = state.members.find(m => m.id === memberId);
  if (member) openMemberDetailsModal(member);
}

function openMemberDetailsModal(member) {
  const modal = document.getElementById('member-details-modal');
  if (!modal) return;

  const years = (member.birth_year || member.death_year)
    ? `${member.birth_year || '?'} — ${member.is_alive ? 'Hozir' : (member.death_year || '?')}`
    : 'Noma\'lum';

  document.getElementById('detail-photo').src = member.photo_url || (member.gender === 'female' ? 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=300&q=80' : 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80');
  document.getElementById('detail-name').textContent = `${member.first_name} ${member.last_name || ''}`;
  document.getElementById('detail-patronymic').textContent = member.patronymic || '';
  document.getElementById('detail-gen-title').textContent = member.generation_title || `${member.generation_level}-avlod`;
  document.getElementById('detail-years').textContent = years;
  document.getElementById('detail-place').textContent = member.birth_place || 'Ko\'rsatilmagan';
  document.getElementById('detail-profession').textContent = member.profession || 'Ko\'rsatilmagan';
  document.getElementById('detail-honor').textContent = member.title_honor || '-';
  document.getElementById('detail-bio').textContent = member.bio || 'Biografiya kiritilmagan.';

  const editBtn = document.getElementById('detail-edit-btn');
  if (editBtn) {
    if (state.isOwner) {
      editBtn.classList.remove('hidden');
      editBtn.onclick = () => {
        closeMemberDetailsModal();
        openMemberModal(member.id);
      };
    } else {
      editBtn.classList.add('hidden');
    }
  }

  modal.classList.remove('hidden');
}

function closeMemberDetailsModal() {
  const modal = document.getElementById('member-details-modal');
  if (modal) modal.classList.add('hidden');
}

// Auth modal
function openAuthModal(mode = 'login') {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;

  const loginTab = document.getElementById('auth-tab-login');
  const regTab = document.getElementById('auth-tab-register');
  const loginForm = document.getElementById('auth-form-login');
  const regForm = document.getElementById('auth-form-register');

  if (mode === 'login') {
    loginTab.classList.add('border-emerald-500', 'text-emerald-400');
    regTab.classList.remove('border-emerald-500', 'text-emerald-400');
    loginForm.classList.remove('hidden');
    regForm.classList.add('hidden');
  } else {
    regTab.classList.add('border-emerald-500', 'text-emerald-400');
    loginTab.classList.remove('border-emerald-500', 'text-emerald-400');
    regForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
  }

  modal.classList.remove('hidden');
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.add('hidden');
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;

  try {
    const res = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    state.token = res.token;
    localStorage.setItem('shajara_token', res.token);
    state.currentUser = res.user;

    showToast(res.message, 'success');
    closeAuthModal();
    updateAuthUI();
    await loadMyShajara();
  } catch (err) {
    console.error('Login xatosi:', err);
  }
}

async function handleQuickDemoLogin(demoUsername = 'anvar_qodirov') {
  try {
    const res = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: demoUsername, password: '123456' })
    });

    state.token = res.token;
    localStorage.setItem('shajara_token', res.token);
    state.currentUser = res.user;

    showToast(`Xush kelibsiz, ${res.user.full_name}! Demo rejimdasiz.`, 'success');
    closeAuthModal();
    updateAuthUI();
    await loadMyShajara();
  } catch (err) {
    showToast('Demo hisobga ulanib bo\'lmadi.', 'error');
  }
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  const full_name = document.getElementById('reg-fullname').value;
  const username = document.getElementById('reg-username').value;
  const password = document.getElementById('reg-password').value;
  const location = document.getElementById('reg-location').value;
  const bio = document.getElementById('reg-bio').value;

  try {
    const res = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ full_name, username, password, location, bio })
    });

    state.token = res.token;
    localStorage.setItem('shajara_token', res.token);
    state.currentUser = res.user;

    showToast(res.message, 'success');
    closeAuthModal();
    updateAuthUI();
    await loadMyShajara();
  } catch (err) {
    console.error('Register xatosi:', err);
  }
}

function logout(reloadView = true) {
  state.token = null;
  state.currentUser = null;
  state.isOwner = false;
  localStorage.removeItem('shajara_token');
  updateAuthUI();
  showToast('Tizimdan chiqdingiz.', 'info');

  if (reloadView) {
    viewUserProfile('anvar_qodirov');
  }
}

// ==================== RASM YUKLASH (IMAGE UPLOAD) ====================
async function handleImageUpload(file, statusEl, urlInput, previewImg = null) {
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    showToast("Fayl hajmi 5MB dan kichik bo'lishi kerak!", "error");
    return;
  }

  if (statusEl) {
    statusEl.textContent = "⏳ Rasm yuklanmoqda...";
    statusEl.className = "text-[10px] text-amber-400 mt-1 block";
  }

  const formData = new FormData();
  formData.append('photo', file);

  try {
    const res = await apiRequest('/upload', {
      method: 'POST',
      body: formData,
      isFormData: true
    });

    if (urlInput) urlInput.value = res.url;
    if (previewImg) previewImg.src = res.url;
    if (statusEl) {
      statusEl.textContent = "✅ Rasm muvaffaqiyatli yuklandi!";
      statusEl.className = "text-[10px] text-emerald-400 mt-1 block";
    }
    showToast("Rasm muvaffaqiyatli yuklandi!", "success");
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = "❌ Yuklashda xatolik yuz berdi.";
      statusEl.className = "text-[10px] text-rose-400 mt-1 block";
    }
  }
}

// ==================== PROFIL SOZLAMALARI (PROFILE MODAL) ====================
function openProfileModal() {
  if (!state.currentUser) return;
  const modal = document.getElementById('profile-modal');
  if (!modal) return;

  document.getElementById('profile-fullname').value = state.currentUser.full_name || '';
  document.getElementById('profile-location').value = state.currentUser.location || '';
  document.getElementById('profile-bio').value = state.currentUser.bio || '';
  document.getElementById('profile-is-public').checked = !!state.currentUser.is_public;

  const avatarUrl = state.currentUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&q=80';
  document.getElementById('profile-avatar-url').value = state.currentUser.avatar || '';
  document.getElementById('profile-avatar-preview').src = avatarUrl;
  const statusEl = document.getElementById('profile-avatar-status');
  if (statusEl) statusEl.textContent = '';

  modal.classList.remove('hidden');
}

function closeProfileModal() {
  const modal = document.getElementById('profile-modal');
  if (modal) modal.classList.add('hidden');
}

async function handleProfileFormSubmit(e) {
  e.preventDefault();
  if (!state.currentUser) return;

  const payload = {
    full_name: document.getElementById('profile-fullname').value.trim(),
    location: document.getElementById('profile-location').value.trim(),
    bio: document.getElementById('profile-bio').value.trim(),
    avatar: document.getElementById('profile-avatar-url').value.trim(),
    is_public: document.getElementById('profile-is-public').checked ? 1 : 0
  };

  try {
    const res = await apiRequest('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    state.currentUser = res.user;
    if (state.isOwner) {
      state.activeUser = res.user;
    }
    updateAuthUI();
    renderStatsBar();
    showToast(res.message || 'Profil muvaffaqiyatli yangilandi!', 'success');
    closeProfileModal();
  } catch (err) {
    console.error('Profil saqlash xatosi:', err);
  }
}

// ==================== JSON IMPORT (TIKLASH) ====================
async function handleJsonImportFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  if (!confirm("Diqqat! Ushbu JSON fayldagi barcha shajara a'zolari hisobingizga yuklanadi. Davom etishni xohlaysizmi?")) {
    e.target.value = '';
    return;
  }

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    let members = [];
    if (Array.isArray(data)) {
      members = data;
    } else if (data && Array.isArray(data.members)) {
      members = data.members;
    } else {
      throw new Error("JSON faylida 'members' ro'yxati topilmadi!");
    }

    const res = await apiRequest('/shajara/import-json', {
      method: 'POST',
      body: JSON.stringify({ members, replace_existing: true })
    });

    showToast(res.message, 'success');
    await loadMyShajara();
    switchView('cards');
  } catch (err) {
    showToast(err.message || "Faylni o'qishda xatolik yuz berdi.", 'error');
  } finally {
    e.target.value = '';
  }
}

function setupEventListeners() {
  document.getElementById('tab-btn-cards')?.addEventListener('click', () => switchView('cards'));
  document.getElementById('tab-btn-tree')?.addEventListener('click', () => switchView('tree'));
  document.getElementById('tab-btn-timeline')?.addEventListener('click', () => switchView('timeline'));
  document.getElementById('tab-btn-explore')?.addEventListener('click', () => switchView('explore'));
  document.getElementById('tab-btn-wisdom')?.addEventListener('click', () => switchView('wisdom'));
  document.getElementById('tab-btn-certificate')?.addEventListener('click', () => switchView('certificate'));

  document.getElementById('auth-form-login')?.addEventListener('submit', handleLoginSubmit);
  document.getElementById('auth-form-register')?.addEventListener('submit', handleRegisterSubmit);
  document.getElementById('member-form')?.addEventListener('submit', handleMemberFormSubmit);
  document.getElementById('quick-add-form')?.addEventListener('submit', handleQuickAddSubmit);
  document.getElementById('profile-form')?.addEventListener('submit', handleProfileFormSubmit);

  // Rasm yuklash tinglovchilari
  document.getElementById('field-photo-file')?.addEventListener('change', (e) => {
    handleImageUpload(e.target.files?.[0], document.getElementById('upload-photo-status'), document.getElementById('field-photo-url'));
  });

  document.getElementById('qa-photo-file')?.addEventListener('change', (e) => {
    handleImageUpload(e.target.files?.[0], document.getElementById('qa-photo-status'), document.getElementById('qa-photo-url'));
  });

  document.getElementById('profile-avatar-file')?.addEventListener('change', (e) => {
    handleImageUpload(e.target.files?.[0], document.getElementById('profile-avatar-status'), document.getElementById('profile-avatar-url'), document.getElementById('profile-avatar-preview'));
  });

  document.getElementById('profile-avatar-url')?.addEventListener('input', (e) => {
    document.getElementById('profile-avatar-preview').src = e.target.value || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&q=80';
  });

  // JSON import tinglovchisi
  document.getElementById('file-import-json')?.addEventListener('change', handleJsonImportFile);

  const searchInput = document.getElementById('explore-search-input');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      state.searchQuery = e.target.value.trim();
      debounceTimer = setTimeout(() => {
        loadExploreUsers();
      }, 350);
    });
  }

  document.getElementById('btn-print-certificate')?.addEventListener('click', () => {
    window.print();
  });

  document.getElementById('btn-export-json')?.addEventListener('click', () => {
    if (state.token) {
      window.open(`${API_BASE}/shajara/export-json`, '_blank');
    }
  });

  document.getElementById('btn-zoom-in')?.addEventListener('click', () => state.treeViewInstance?.zoom(1.2));
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => state.treeViewInstance?.zoom(0.8));
  document.getElementById('btn-zoom-reset')?.addEventListener('click', () => state.treeViewInstance?.resetView());
}

window.switchView = switchView;
window.switchCardsSubView = switchCardsSubView;
window.openMemberModal = openMemberModal;
window.closeMemberModal = closeMemberModal;
window.openQuickAddModal = openQuickAddModal;
window.closeQuickAddModal = closeQuickAddModal;
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.handleImageUpload = handleImageUpload;
window.handleTreeMemberFilter = handleTreeMemberFilter;
window.openMemberDetailsModalById = openMemberDetailsModalById;
window.closeMemberDetailsModal = closeMemberDetailsModal;
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.handleQuickDemoLogin = handleQuickDemoLogin;
window.viewUserProfile = viewUserProfile;
window.loadMyShajara = loadMyShajara;
window.deleteMemberConfirm = deleteMemberConfirm;
window.logout = logout;
