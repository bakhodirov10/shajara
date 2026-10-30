/**
 * Shajara.uz - Oila Shoxlari va Ko'p Bolali Interaktiv SVG Daraxti
 */

class ShajaraTreeView {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = options;
    this.members = [];
    this.scale = 0.95;
    this.panX = 40;
    this.panY = 40;
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    this.onNodeClick = options.onNodeClick || (() => {});
    this.onAddChildClick = options.onAddChildClick || (() => {});
  }

  setMembers(members) {
    this.members = members || [];
    this.render();
  }

  resetView() {
    this.scale = 0.95;
    this.panX = 40;
    this.panY = 40;
    this.updateTransform();
  }

  zoom(factor) {
    this.scale = Math.max(0.3, Math.min(2.5, this.scale * factor));
    this.updateTransform();
  }

  updateTransform() {
    if (this.viewportG) {
      this.viewportG.setAttribute('transform', `translate(${this.panX}, ${this.panY}) scale(${this.scale})`);
    }
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = '';

    if (!this.members || this.members.length === 0) {
      this.container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-96 text-slate-400">
          <p class="text-lg font-medium">Shajarada hech qanday a'zo mavjud emas.</p>
        </div>
      `;
      return;
    }

    const width = Math.max(1600, this.container.clientWidth || 1200);
    const height = Math.max(1200, (this.members.length * 80));

    // SVG container
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.style.cursor = 'grab';
    svg.style.userSelect = 'none';

    // Gradients
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <linearGradient id="cardGradMale" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1e293b" />
        <stop offset="100%" stop-color="#0f172a" />
      </linearGradient>
      <linearGradient id="cardGradFemale" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#2a1e35" />
        <stop offset="100%" stop-color="#120c1a" />
      </linearGradient>
      <linearGradient id="treeBranchGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#f59e0b" />
        <stop offset="100%" stop-color="#10b981" />
      </linearGradient>
    `;
    svg.appendChild(defs);

    const viewport = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.viewportG = viewport;
    this.updateTransform();
    svg.appendChild(viewport);

    // Pan & Zoom hodisalari
    svg.addEventListener('mousedown', (e) => {
      if (e.target.closest('.interactive-btn')) return;
      this.isDragging = true;
      this.startX = e.clientX - this.panX;
      this.startY = e.clientY - this.panY;
      svg.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      this.panX = e.clientX - this.startX;
      this.panY = e.clientY - this.startY;
      this.updateTransform();
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
      svg.style.cursor = 'grab';
    });

    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      this.zoom(zoomFactor);
    }, { passive: false });

    // Lines & Nodes Groups
    const linesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const nodesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    viewport.appendChild(linesGroup);
    viewport.appendChild(nodesGroup);

    // Oila tuzilmasini hisoblash:
    // Avlod darajalarini olish (masalan: 7, 6, 5, 4, 3, 2, 1, 0)
    // Yuqoridan pastga: eng qadimgi ajdod tepada (7-avlod), bolalar pastda (1, 0)
    const genMap = new Map();
    this.members.forEach(m => {
      const lvl = m.generation_level !== undefined ? m.generation_level : 1;
      if (!genMap.has(lvl)) genMap.set(lvl, []);
      genMap.get(lvl).push(m);
    });

    const levels = Array.from(genMap.keys()).sort((a, b) => b - a); // 7 dan 0 ga kamayish tartibida

    const cardW = 180;
    const cardH = 75;
    const gapX = 35;
    const gapY = 130;
    const startY = 50;

    const memberCoords = new Map();

    // Har bir darajadagi a'zolarni oila birliklari bo'yicha guruhlash
    levels.forEach((lvl, lvlIdx) => {
      const membersInLvl = genMap.get(lvl);
      const y = startY + lvlIdx * gapY;
      
      // Ota-ona yoki er-xotinlarni yonma-yon qo'yish
      const placed = new Set();
      const arranged = [];

      membersInLvl.forEach(m => {
        if (placed.has(m.id)) return;

        arranged.push(m);
        placed.add(m.id);

        // Agar turmush o'rtog'i ham shu darajada bo'lsa, yoniga qo'yish
        if (m.spouse_id) {
          const spouse = membersInLvl.find(s => s.id === m.spouse_id);
          if (spouse && !placed.has(spouse.id)) {
            arranged.push(spouse);
            placed.add(spouse.id);
          }
        }
      });

      // Gorizontal koordinatalarni taqsimlash
      const totalWidth = arranged.length * (cardW + gapX);
      const startX = Math.max(60, (width - totalWidth) / 2);

      arranged.forEach((m, idx) => {
        const x = startX + idx * (cardW + gapX);
        memberCoords.set(m.id, {
          x,
          y,
          cx: x + cardW / 2,
          cy: y + cardH / 2,
          bottomY: y + cardH,
          topY: y,
          member: m
        });
      });
    });

    // Ulanish chiziqlarini chizish (Parents -> Children)
    // 1. Er-xotin (Spouse) o'rtasidagi yurakli bog'lovchi chiziq
    const handledCouples = new Set();
    this.members.forEach(m => {
      if (m.spouse_id && !handledCouples.has(`${Math.min(m.id, m.spouse_id)}-${Math.max(m.id, m.spouse_id)}`)) {
        const c1 = memberCoords.get(m.id);
        const c2 = memberCoords.get(m.spouse_id);
        if (c1 && c2 && c1.y === c2.y) {
          handledCouples.add(`${Math.min(m.id, m.spouse_id)}-${Math.max(m.id, m.spouse_id)}`);
          
          // O'rtadagi bog'lovchi chiziq
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', c1.x < c2.x ? c1.x + cardW : c2.x + cardW);
          line.setAttribute('y1', c1.cy);
          line.setAttribute('x2', c1.x < c2.x ? c2.x : c1.x);
          line.setAttribute('y2', c2.cy);
          line.setAttribute('stroke', '#f43f5e');
          line.setAttribute('stroke-width', '2');
          line.setAttribute('stroke-dasharray', '4,2');
          linesGroup.appendChild(line);

          // Yurakcha belgisi
          const heart = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          heart.setAttribute('x', (c1.cx + c2.cx) / 2);
          heart.setAttribute('y', c1.cy + 4);
          heart.setAttribute('text-anchor', 'middle');
          heart.setAttribute('font-size', '11');
          heart.setAttribute('fill', '#f43f5e');
          heart.textContent = '❤️';
          linesGroup.appendChild(heart);
        }
      }
    });

    // 2. Ota-onadan barcha bolalarga shoxlanuvchi daraxt chiziqlari (Branching Tree Lines)
    // Guruhlangan ota-onalar va ularning farzandlari
    const parentGroups = new Map(); // key: "parent_id" yoki "parent_id-mother_id", value: [children]

    this.members.forEach(m => {
      if (m.parent_id || m.mother_id) {
        const pKey = m.parent_id ? `p_${m.parent_id}` : `m_${m.mother_id}`;
        if (!parentGroups.has(pKey)) parentGroups.set(pKey, []);
        parentGroups.get(pKey).push(m);
      }
    });

    parentGroups.forEach((children, pKey) => {
      let parentCoord = null;
      let spouseCoord = null;

      if (pKey.startsWith('p_')) {
        const pId = parseInt(pKey.replace('p_', ''));
        parentCoord = memberCoords.get(pId);
        if (parentCoord && parentCoord.member.spouse_id) {
          spouseCoord = memberCoords.get(parentCoord.member.spouse_id);
        }
      } else {
        const mId = parseInt(pKey.replace('m_', ''));
        parentCoord = memberCoords.get(mId);
      }

      if (!parentCoord) return;

      // Ota-ona markaziy nuqtasi
      const parentCenterX = spouseCoord && spouseCoord.y === parentCoord.y
        ? (parentCoord.cx + spouseCoord.cx) / 2
        : parentCoord.cx;
      const parentBottomY = parentCoord.bottomY;

      // Bolalarning koordinatalari
      const childCoords = children
        .map(ch => memberCoords.get(ch.id))
        .filter(Boolean)
        .sort((a, b) => a.cx - b.cx);

      if (childCoords.length === 0) return;

      const midY = parentBottomY + 25;

      // 1. Ota-onadan pastga tushuvchi vertikal chiziq
      const stemLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      stemLine.setAttribute('x1', parentCenterX);
      stemLine.setAttribute('y1', parentBottomY);
      stemLine.setAttribute('x2', parentCenterX);
      stemLine.setAttribute('y2', midY);
      stemLine.setAttribute('stroke', '#d97706');
      stemLine.setAttribute('stroke-width', '2.5');
      linesGroup.appendChild(stemLine);

      // 2. Bolalar ustidagi gorizontal shoxlash shinas (Branching horizontal bar)
      const minChildX = Math.min(parentCenterX, childCoords[0].cx);
      const maxChildX = Math.max(parentCenterX, childCoords[childCoords.length - 1].cx);

      const branchBar = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      branchBar.setAttribute('x1', minChildX);
      branchBar.setAttribute('y1', midY);
      branchBar.setAttribute('x2', maxChildX);
      branchBar.setAttribute('y2', midY);
      branchBar.setAttribute('stroke', 'url(#treeBranchGrad)');
      branchBar.setAttribute('stroke-width', '2.5');
      linesGroup.appendChild(branchBar);

      // 3. Shina dan har bir bolaga tushuvchi vertikal chiziqlar
      childCoords.forEach(chCoord => {
        const childDrop = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        childDrop.setAttribute('x1', chCoord.cx);
        childDrop.setAttribute('y1', midY);
        childDrop.setAttribute('x2', chCoord.cx);
        childDrop.setAttribute('y2', chCoord.topY);
        childDrop.setAttribute('stroke', '#10b981');
        childDrop.setAttribute('stroke-width', '2');
        linesGroup.appendChild(childDrop);

        // Bolaning boshidagi kichik zumrad nuqta
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', chCoord.cx);
        dot.setAttribute('cy', chCoord.topY);
        dot.setAttribute('r', '3');
        dot.setAttribute('fill', '#10b981');
        linesGroup.appendChild(dot);
      });
    });

    // Tugunlar (Kartochkalar) ni chizish
    memberCoords.forEach((coord, memberId) => {
      const { x, y, member } = coord;
      const isFemale = member.gender === 'female';
      const isAlive = !!member.is_alive;

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.style.cursor = 'pointer';

      // Asosiy kartochka to'rtburchagi
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', x);
      rect.setAttribute('y', y);
      rect.setAttribute('width', cardW);
      rect.setAttribute('height', cardH);
      rect.setAttribute('rx', '10');
      rect.setAttribute('fill', isFemale ? 'url(#cardGradFemale)' : 'url(#cardGradMale)');
      rect.setAttribute('stroke', isFemale ? '#ec4899' : (isAlive ? '#10b981' : '#d97706'));
      rect.setAttribute('stroke-width', member.relation_type === 'self' ? '2.5' : '1.5');
      rect.setAttribute('filter', 'drop-shadow(0 4px 10px rgba(0,0,0,0.5))');
      g.appendChild(rect);

      // Nishon (Role / Generation Badge)
      const badgeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      badgeText.setAttribute('x', x + 10);
      badgeText.setAttribute('y', y + 15);
      badgeText.setAttribute('font-size', '9');
      badgeText.setAttribute('font-weight', 'bold');
      badgeText.setAttribute('fill', isFemale ? '#f472b6' : '#fbbf24');
      const roleStr = member.generation_title || `${member.generation_level}-avlod`;
      badgeText.textContent = roleStr.length > 20 ? roleStr.slice(0, 18) + '..' : roleStr;
      g.appendChild(badgeText);

      // Hayotlik statusi
      const statusText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      statusText.setAttribute('x', x + cardW - 8);
      statusText.setAttribute('y', y + 15);
      statusText.setAttribute('text-anchor', 'end');
      statusText.setAttribute('font-size', '8');
      statusText.setAttribute('fill', isAlive ? '#34d399' : '#94a3b8');
      statusText.textContent = isAlive ? '● Hayot' : '✝ Marhum';
      g.appendChild(statusText);

      // Ism va Familiya
      const nameText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      nameText.setAttribute('x', x + 10);
      nameText.setAttribute('y', y + 36);
      nameText.setAttribute('font-size', '13');
      nameText.setAttribute('font-weight', 'bold');
      nameText.setAttribute('fill', '#ffffff');
      const name = `${member.first_name} ${member.last_name ? member.last_name[0] + '.' : ''}`;
      nameText.textContent = name;
      g.appendChild(nameText);

      // Yili va Kasbi
      const infoText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      infoText.setAttribute('x', x + 10);
      infoText.setAttribute('y', y + 52);
      infoText.setAttribute('font-size', '10');
      infoText.setAttribute('fill', '#94a3b8');
      const yr = member.birth_year ? `${member.birth_year}-y.` : '';
      const prof = member.profession ? member.profession.slice(0, 14) : '';
      infoText.textContent = [yr, prof].filter(Boolean).join(' • ');
      g.appendChild(infoText);

      // Agar bolalari bo'lsa, sonini ko'rsatish
      if (member.children_count > 0) {
        const countText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        countText.setAttribute('x', x + cardW - 8);
        countText.setAttribute('y', y + 68);
        countText.setAttribute('text-anchor', 'end');
        countText.setAttribute('font-size', '9');
        countText.setAttribute('font-weight', 'bold');
        countText.setAttribute('fill', '#38bdf8');
        countText.textContent = `👶 ${member.children_count} bola`;
        g.appendChild(countText);
      }

      // "+ Bola qo'shish" kichik interaktiv tugmasi (Interactive SVG Button)
      const btnG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      btnG.setAttribute('class', 'interactive-btn');
      btnG.style.cursor = 'pointer';

      const btnRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      btnRect.setAttribute('x', x + 8);
      btnRect.setAttribute('y', y + 58);
      btnRect.setAttribute('width', '74');
      btnRect.setAttribute('height', '14');
      btnRect.setAttribute('rx', '4');
      btnRect.setAttribute('fill', '#064e3b');
      btnRect.setAttribute('stroke', '#10b981');
      btnRect.setAttribute('stroke-width', '0.8');
      btnG.appendChild(btnRect);

      const btnText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      btnText.setAttribute('x', x + 45);
      btnText.setAttribute('y', y + 68);
      btnText.setAttribute('text-anchor', 'middle');
      btnText.setAttribute('font-size', '8');
      btnText.setAttribute('font-weight', 'bold');
      btnText.setAttribute('fill', '#6ee7b7');
      btnText.textContent = '➕ Bola qo\'sh';
      btnG.appendChild(btnText);

      btnG.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onAddChildClick(member);
      });

      g.appendChild(btnG);

      // Kartochka bosilganda batafsil ko'rish
      g.addEventListener('click', () => {
        this.onNodeClick(member);
      });

      // Hover
      g.addEventListener('mouseenter', () => {
        rect.setAttribute('stroke-width', '3');
      });
      g.addEventListener('mouseleave', () => {
        rect.setAttribute('stroke-width', member.relation_type === 'self' ? '2.5' : '1.5');
      });

      nodesGroup.appendChild(g);
    });

    this.container.appendChild(svg);
  }
}

window.ShajaraTreeView = ShajaraTreeView;
