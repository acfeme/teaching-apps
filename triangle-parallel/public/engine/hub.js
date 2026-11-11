// 허브 화면: 닮음 탐구 교실의 유닛 카드 목록.
// 학생용(/)은 문제풀이 유닛·수업 자료로 들어가고,
// 교사용(/admin, HUB_MODE='admin')은 유닛별 관리자 화면, 수업 자료 열기·닫기, 학생 보관함 현황을 다룬다.
(function () {
  const app = document.getElementById('app');
  const isAdmin = window.HUB_MODE === 'admin';
  const CLASSES = ['2-1', '2-2', '2-3', '2-4', '2-A', '2-B', '2-C']; // 2-A·2-B·2-C = 외부 체험용 샘플반
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const units = window.UNIT_LIST;
  const group = (kind) => units.filter((u) => u.kind === kind);
  const PW_KEY = 'tp-admin'; // 유닛 관리자 화면과 같은 저장 이름(한 번 넣으면 모두 쓰인다)
  const savedPw = () => { try { return sessionStorage.getItem(PW_KEY) || ''; } catch (e) { return ''; } };
  const setPw = (v) => { try { if (v) sessionStorage.setItem(PW_KEY, v); else sessionStorage.removeItem(PW_KEY); } catch (e) { /* 저장 불가 */ } };
  let pw = isAdmin ? savedPw() : '';
  let mat = null; // { 자료: { 반: bool } }
  let matBusy = false;

  async function api(path, opts = {}) {
    const r = await fetch(path, { cache: 'no-store', ...opts, headers: { ...(pw ? { 'x-admin-password': pw } : {}), ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || '잠시 후 다시 시도해 주세요.'); e.status = r.status; throw e; }
    return d;
  }

  function card(u) {
    if (u.kind === 'soon') {
      return `<div class="unit-card is-soon"><div class="u-icon">${u.icon}</div><div class="u-body"><b>${esc(u.title)}</b><span>${esc(u.desc)}</span></div><span class="u-tag">준비 중</span></div>`;
    }
    if (u.kind === 'link') {
      return `<a class="unit-card is-link" href="${esc(u.url)}" target="_blank" rel="noopener"><div class="u-icon">${u.icon}</div><div class="u-body"><b>${esc(u.title)}</b><span>${esc(u.desc)}</span></div><span class="u-tag">열기 ↗</span></a>`;
    }
    if (u.kind === 'game') {
      // 교사 화면: 단계가 있는 게임은 단계별 체험(같은 탭에서 열어야 체험 모드가 켜진다)
      if (isAdmin) {
        const btns = u.stages
          ? Array.from({ length: u.stages }, (_, i) => `<a class="mat-sw on" style="text-decoration:none;display:inline-flex;align-items:center" href="${esc(u.url)}?stage=${i + 1}">${i + 1}단계 체험 ▶</a>`).join('')
          : `<a class="mat-sw on" style="text-decoration:none;display:inline-flex;align-items:center" href="${esc(u.url)}">체험하기 ▶</a>`;
        return `<div class="unit-card is-game admin"><div class="u-icon">${u.icon}</div><div class="u-body"><b>${esc(u.title)}</b><span>${esc(u.desc)}</span>
          <div class="mat-sws">${btns}</div>${u.stages ? '<span class="mat-note">체험 모드: 하트가 줄지 않고, 문제를 넘길 수 있고, 랭킹에 남지 않아요. (비밀번호를 넣은 뒤 눌러요)</span>' : ''}</div></div>`;
      }
      return `<a class="unit-card is-game" href="${esc(u.url)}"><div class="u-icon">${u.icon}</div><div class="u-body"><b>${esc(u.title)}</b><span>${esc(u.desc)}</span></div><span class="u-tag go">하러 가기 →</span></a>`;
    }
    if (u.kind === 'mat') {
      if (isAdmin) {
        return `<div class="unit-card is-mat admin"><div class="u-icon">${u.icon}</div><div class="u-body"><b>${esc(u.title)}</b><span>${esc(u.desc)}</span>
          <div class="mat-sws" data-mat="${u.id}"></div></div>
          <a class="u-tag" href="${esc(u.url)}" title="선생님은 반과 상관없이 볼 수 있어요">미리 보기</a></div>`;
      }
      return `<a class="unit-card is-mat" href="${esc(u.url)}" data-matcard="${u.id}"><div class="u-icon">${u.icon}</div><div class="u-body"><b>${esc(u.title)}</b><span>${esc(u.desc)}</span>
        <span class="u-open" data-matopen="${u.id}"></span></div><span class="u-tag" data-mattag="${u.id}">열기</span></a>`;
    }
    const href = isAdmin ? `/admin/${u.id}` : `/u/${u.id}`;
    return `<a class="unit-card is-quiz" href="${href}"><div class="u-icon">${u.icon}</div><div class="u-body"><b>${esc(u.title)}</b><span>${esc(u.desc)}</span>
      <span class="u-open" data-open="${u.id}"></span></div><span class="u-tag go">${isAdmin ? '관리하기' : '들어가기'} →</span></a>`;
  }

  function render() {
    const quiz = group('quiz'), mats = group('mat'), games = group('game'), link = group('link'), soon = group('soon');
    app.innerHTML = `<div class="wrap">
      <header class="hub-head">
        <div class="hub-kicker">${isAdmin ? '교사 관리자' : '중학교 2학년 · 닮음'}</div>
        <h1 class="hub-title">${esc(window.SITE.title)}</h1>
        <p class="hub-sub">${isAdmin ? '관리할 유닛을 고르세요. 비밀번호는 한 번만 넣으면 모든 유닛에 쓰여요.' : '오늘 공부할 유닛을 골라 들어가세요. 문제풀이와 수업 자료는 선생님이 반을 열어 주시면 볼 수 있어요.'}</p>
      </header>
      ${isAdmin ? '<div id="login"></div>' : '<div id="meChip" class="me-chip"></div>'}
      <section><h2 class="hub-h2">✏️ 문제풀이</h2><div class="unit-grid">${quiz.map(card).join('')}</div></section>
      ${mats.length ? `<section><h2 class="hub-h2">📚 수업 자료</h2>${isAdmin ? '<p class="hub-note">반마다 눌러서 열고 닫아요. 닫으면 학생 화면이 15초 안에 잠겨요.</p>' : ''}<div class="unit-grid">${mats.map(card).join('')}</div></section>` : ''}
      ${games.length ? `<section><h2 class="hub-h2 hub-h2-row">🎮 게임 ${window.RANK ? '<button class="g-rank-btn" id="gameRank">🏆 게임 랭킹</button>' : ''}</h2><div class="unit-grid">${games.map(card).join('')}</div></section>` : ''}
      ${link.length ? `<section><h2 class="hub-h2">🔗 바로가기</h2><div class="unit-grid">${link.map(card).join('')}</div></section>` : ''}
      ${isAdmin ? '<section><h2 class="hub-h2">🧺 학생 보관함 현황</h2><div id="garden"></div></section><section><h2 class="hub-h2">🔐 학생 별명·비밀번호</h2><div id="nicks"></div></section>' : ''}
      ${soon.length ? `<section><h2 class="hub-h2">🌱 곧 열려요</h2><div class="unit-grid">${soon.map(card).join('')}</div></section>` : ''}
      ${isAdmin ? '<p class="hub-foot"><a href="/">학생 첫 화면 보기</a></p>' : ''}
    </div>`;
    loadOpen(quiz);
    app.querySelector('#gameRank')?.addEventListener('click', () => window.RANK.open('match'));
    if (isAdmin) { paintLogin(); if (pw) loadMat(); paintGarden(); paintNicks(); } else { loadMat(); paintMe(); }
  }

  // 문제풀이 유닛마다 지금 열린 반을 보여 준다
  async function loadOpen(quiz) {
    await Promise.all(quiz.map(async (u) => {
      const el = app.querySelector(`[data-open="${u.id}"]`);
      try {
        const d = await api(`/api/state?unit=${encodeURIComponent(u.id)}`);
        const open = Object.entries(d.open || {}).filter(([, v]) => v).map(([c]) => `${c}반`);
        if (el) {
          el.textContent = open.length ? `🔓 열린 반: ${open.join(', ')}` : '🔒 아직 열린 반이 없어요';
          el.classList.toggle('on', open.length > 0);
        }
      } catch (e) {
        if (el) el.textContent = '';
      }
    }));
  }

  // ---- 수업 자료 열림·닫힘 ----
  async function loadMat() {
    if (matBusy) return;
    try {
      const d = await api(isAdmin ? '/api/material?check=1' : '/api/material');
      if (matBusy) return;
      mat = d.open;
      paintMat();
    } catch (e) {
      if (isAdmin && e.status === 401) { pw = ''; setPw(''); paintLogin('비밀번호가 바뀌었어요. 다시 넣어 주세요.'); paintMat(); paintGarden(); }
    }
  }

  function paintMat() {
    group('mat').forEach((u) => {
      const st = mat?.[u.id] || {};
      const open = CLASSES.filter((c) => st[c]);
      if (!isAdmin) {
        const el = app.querySelector(`[data-matopen="${u.id}"]`);
        const tag = app.querySelector(`[data-mattag="${u.id}"]`);
        const cardEl = app.querySelector(`[data-matcard="${u.id}"]`);
        if (!el || !mat) return;
        el.textContent = open.length ? `🔓 열린 반: ${open.map((c) => `${c}반`).join(', ')}` : '🔒 선생님이 열어 주시면 볼 수 있어요';
        el.classList.toggle('on', open.length > 0);
        tag.textContent = open.length ? '열기' : '잠김';
        tag.classList.toggle('go', open.length > 0);
        cardEl.classList.toggle('is-locked', !open.length);
        return;
      }
      const box = app.querySelector(`[data-mat="${u.id}"]`);
      if (!box) return;
      if (!pw || !mat) { box.innerHTML = '<span class="mat-note">비밀번호를 넣으면 열고 닫을 수 있어요.</span>'; return; }
      box.innerHTML = CLASSES.map((c) => `<button class="mat-sw ${st[c] ? 'on' : ''}" data-id="${u.id}" data-cls="${c}" aria-pressed="${st[c] ? 'true' : 'false'}">${c}반 <b>${st[c] ? '열림' : '닫힘'}</b></button>`).join('')
        + `<button class="mat-all" data-id="${u.id}" data-all="${open.length === CLASSES.length ? '0' : '1'}">${open.length === CLASSES.length ? '모든 반 닫기' : '모든 반 열기'}</button>`;
      box.querySelectorAll('.mat-sw').forEach((b) => { b.onclick = () => setMat(b.dataset.id, b.dataset.cls, !st[b.dataset.cls]); });
      box.querySelector('.mat-all').onclick = (e) => setMat(u.id, 'all', e.currentTarget.dataset.all === '1');
    });
  }

  async function setMat(id, cls, value) {
    const prev = JSON.parse(JSON.stringify(mat));
    (cls === 'all' ? CLASSES : [cls]).forEach((c) => { mat[id][c] = value; });
    matBusy = true;
    paintMat();
    try {
      const d = await api('/api/material', { method: 'POST', body: JSON.stringify({ id, cls, value }) });
      mat = d.open;
      toast(`${units.find((u) => u.id === id).title} · ${cls === 'all' ? '모든 반' : `${cls}반`} ${value ? '열었어요' : '닫았어요'}`);
    } catch (e) {
      mat = prev;
      toast(`바꾸지 못했어요: ${e.message}`);
    }
    matBusy = false;
    paintMat();
  }

  function toast(msg) {
    let t = document.querySelector('.hub-toast');
    if (!t) { t = document.createElement('div'); t.className = 'hub-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('on'), 2200);
  }

  // ---- 교사 로그인(수업 자료·보관함용) ----
  function paintLogin(msg) {
    const box = app.querySelector('#login');
    if (!box) return;
    if (pw) {
      box.innerHTML = '<div class="hub-login ok">🔑 로그인되어 있어요. <button id="logout" class="link-btn">나가기</button></div>';
      box.querySelector('#logout').onclick = () => { pw = ''; setPw(''); mat = null; paintLogin(); paintMat(); paintGarden(); paintNicks(); };
      return;
    }
    box.innerHTML = `<form class="hub-login" id="lf"><label>🔑 수업 자료 열기·닫기와 보관함 현황은 비밀번호를 넣어야 보여요.</label>
      <div class="row"><input id="pw" type="password" autocomplete="current-password" placeholder="비밀번호" aria-label="비밀번호"><button class="st-btn go" type="submit">확인</button></div>
      <div class="msg ${msg ? '' : 'hidden'}" id="lmsg">${esc(msg || '')}</div></form>`;
    box.querySelector('#lf').onsubmit = async (e) => {
      e.preventDefault();
      const v = box.querySelector('#pw').value;
      if (!v) return;
      pw = v;
      try {
        const d = await api('/api/material?check=1');
        setPw(v);
        mat = d.open;
        paintLogin(); paintMat(); paintGarden(); paintNicks();
      } catch (err) {
        pw = '';
        paintLogin(err.message);
      }
    };
  }

  // ---- 학생 보관함 현황(반 → 학생별 유닛 나무·사과) ----
  let gardenCls = CLASSES[0];
  async function paintGarden() {
    const box = app.querySelector('#garden');
    if (!box) return;
    if (!pw) { box.innerHTML = '<div class="empty">비밀번호를 넣으면 볼 수 있어요.</div>'; return; }
    box.innerHTML = `<div class="g-tabs">${CLASSES.map((c) => `<button class="g-tab ${c === gardenCls ? 'on' : ''}" data-c="${c}">${c}반</button>`).join('')}</div><div id="gtable"><div class="empty">불러오는 중…</div></div>`;
    box.querySelectorAll('.g-tab').forEach((b) => { b.onclick = () => { gardenCls = b.dataset.c; paintGarden(); }; });
    try {
      const d = await api(`/api/garden?all=1&cls=${encodeURIComponent(gardenCls)}`);
      const t = box.querySelector('#gtable');
      if (!d.students.length) { t.innerHTML = '<div class="empty">아직 문제를 푼 학생이 없어요.</div>'; return; }
      const head = d.units.map((u) => `<th>${esc(u.title)}<small>나무 · 🍎 수확/열림</small></th>`).join('');
      const rows = d.students.map((s) => `<tr><td>${s.num}번</td>${d.units.map((u) => {
        const g = s.units[u.id];
        return `<td class="left"><span class="g-tree">${esc(window.treeName(g.n, g.max))}</span> <small>${g.n}/${g.max}</small><br>🍎 ${g.harvested} / ${g.ripe}${g.ready ? ` <b class="g-ready">수확 대기 ${g.ready}</b>` : ''}</td>`;
      }).join('')}<td><b>🧺 ${s.basket}</b></td></tr>`).join('');
      t.innerHTML = `<div class="table-wrap"><table class="g-table"><thead><tr><th>번호</th>${head}<th>보관함</th></tr></thead><tbody>${rows}</tbody></table></div>
        <p class="hub-note">나무는 1·2단계에서 맞힌 문제 수(마지막 응시)만큼 자라요. 다 자라면 사과가 열리고(최대 8개), 피드백 문제를 끝낼 때마다 사과 1개를 더 받아요. 학생이 보관함에서 수확하면 🧺에 쌓여요.</p>`;
    } catch (e) {
      if (e.status === 401) { pw = ''; setPw(''); paintLogin('비밀번호가 바뀌었어요. 다시 넣어 주세요.'); paintMat(); paintGarden(); return; }
      box.querySelector('#gtable').innerHTML = `<div class="msg">${esc(e.message)}</div>`;
    }
  }

  // ---- 학생: 지금 로그인한 별명과 나가기 ----
  function paintMe() {
    const box = app.querySelector('#meChip');
    if (!box || !window.ME) return;
    const m = window.ME.get();
    box.innerHTML = m
      ? `🙋 ${esc(m.cls)}반 · 별명 <b>${esc(m.nick || '')}</b> <button class="link-btn" id="meOut">나가기</button>`
      : '<button class="link-btn" id="meIn">🔑 내 번호로 들어가기</button> <span class="hub-note">게임·순위에는 번호 대신 별명만 보여요.</span>';
    box.querySelector('#meOut')?.addEventListener('click', () => { window.ME.logout(); paintMe(); });
    box.querySelector('#meIn')?.addEventListener('click', async () => { await window.ME.login(); paintMe(); });
  }

  // ---- 교사: 학생 별명·비밀번호(별명 ↔ 반·번호는 선생님만 볼 수 있다) ----
  let nickCls = CLASSES[0];
  async function paintNicks() {
    const box = app.querySelector('#nicks');
    if (!box) return;
    if (!pw) { box.innerHTML = '<div class="empty">비밀번호를 넣으면 볼 수 있어요.</div>'; return; }
    box.innerHTML = `<div class="g-tabs">${CLASSES.map((c) => `<button class="g-tab ${c === nickCls ? 'on' : ''}" data-c="${c}">${c}반</button>`).join('')}</div><div id="ntable"><div class="empty">불러오는 중…</div></div>`;
    box.querySelectorAll('.g-tab').forEach((b) => { b.onclick = () => { nickCls = b.dataset.c; paintNicks(); }; });
    try {
      const d = await api(`/api/auth?cls=${encodeURIComponent(nickCls)}`);
      const t = box.querySelector('#ntable');
      if (!d.students.length) { t.innerHTML = '<div class="empty">아직 비밀번호를 정한 학생이 없어요.</div>'; return; }
      const rows = d.students.map((s) => `<tr><td>${s.num}번</td><td class="left"><b>${esc(s.nick || '—')}</b></td>
        <td>${s.locked ? '🔒 잠김(5번 틀림)' : s.hasPin ? '✅ 정함' : '⬜ 아직'}</td>
        <td><button class="link-btn" data-reset="${s.num}" ${s.hasPin ? '' : 'disabled'}>비밀번호 초기화</button> · <button class="link-btn" data-renick="${s.num}">별명 다시 뽑기</button></td></tr>`).join('');
      t.innerHTML = `<div class="table-wrap"><table class="g-table"><thead><tr><th>번호</th><th>별명</th><th>비밀번호</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
        <p class="hub-note">학생 화면과 랭킹에는 번호 없이 별명만 보여요. 비밀번호는 선생님도 볼 수 없고, 초기화하면 학생이 다음에 들어올 때 새로 정해요. 별명을 다시 뽑으면 랭킹에도 새 별명으로 보여요.</p>`;
      t.querySelectorAll('[data-reset]').forEach((b) => {
        b.onclick = async () => {
          if (!confirm(`${nickCls}반 ${b.dataset.reset}번 학생의 비밀번호를 초기화할까요?
학생이 다음에 들어올 때 새 비밀번호를 정해요.`)) return;
          try { await api('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'reset', cls: nickCls, num: Number(b.dataset.reset) }) }); toast('비밀번호를 초기화했어요.'); paintNicks(); } catch (e) { toast(e.message); }
        };
      });
      t.querySelectorAll('[data-renick]').forEach((b) => {
        b.onclick = async () => {
          if (!confirm(`${nickCls}반 ${b.dataset.renick}번 학생의 별명을 새로 뽑을까요?`)) return;
          try { const r = await api('/api/auth', { method: 'POST', body: JSON.stringify({ action: 'renick', cls: nickCls, num: Number(b.dataset.renick) }) }); toast(`새 별명: ${r.nick}`); paintNicks(); } catch (e) { toast(e.message); }
        };
      });
    } catch (e) {
      if (e.status === 401) { pw = ''; setPw(''); paintLogin('비밀번호가 바뀌었어요. 다시 넣어 주세요.'); paintMat(); paintGarden(); paintNicks(); return; }
      box.querySelector('#ntable').innerHTML = `<div class="msg">${esc(e.message)}</div>`;
    }
  }

  render();
  setInterval(() => {
    if (document.hidden) return;
    loadOpen(group('quiz'));
    if (!isAdmin || pw) loadMat();
  }, 10000);
})();
