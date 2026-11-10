// 🧺 내 보관함: 화면 오른쪽 아래 버튼. 누르면 유닛별 사과나무와 수확한 사과를 언제든 볼 수 있다.
// 허브(/)와 문제풀이 유닛 화면(/u/<id>)에서 함께 쓴다. 학생은 반·번호(sessionStorage 'tp-me')로 구분한다.
// 유닛 화면은 window.GARDEN_VISIBLE()로 시험 중에는 버튼을 숨긴다.
(function () {
  const CLASSES = ['2-1', '2-2', '2-3', '2-4'];
  const MAX_NUMBER = 35;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ss = {
    get: (k) => { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 불가 */ } },
  };
  const inUnit = typeof window.GARDEN_VISIBLE === 'function' || !!window.UNIT;
  const me = () => { const m = ss.get('tp-me'); return m && CLASSES.includes(m.cls) && m.num >= 1 && m.num <= MAX_NUMBER ? m : null; };
  const icon = (id) => (window.UNIT_LIST || []).find((u) => u.id === id)?.icon || '🌳';

  const btn = document.createElement('button');
  btn.className = 'garden-btn';
  btn.type = 'button';
  btn.innerHTML = '🧺 <span>내 보관함</span><b class="garden-badge hidden"></b>';
  document.body.appendChild(btn);
  let overlay = null;
  let data = null;

  async function api(path, opts) {
    let r;
    try { r = await fetch(path, { cache: 'no-store', ...opts }); } catch (e) { throw new Error('인터넷 연결을 확인하고 다시 눌러 주세요.'); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || '잠시 후 다시 시도해 주세요.');
    return d;
  }

  // 수확할 사과가 있으면 버튼에 숫자를 띄운다
  async function refreshBadge() {
    const m = me();
    const badge = btn.querySelector('.garden-badge');
    if (!m) { badge.classList.add('hidden'); return; }
    try {
      data = await api(`/api/garden?cls=${encodeURIComponent(m.cls)}&num=${m.num}`);
      const ready = data.units.reduce((t, u) => t + u.ready, 0);
      badge.textContent = ready ? `🍎${ready}` : '';
      badge.classList.toggle('hidden', !ready);
      btn.classList.toggle('ready', ready > 0);
    } catch (e) { /* 다음에 다시 */ }
  }

  function visible() {
    if (overlay) return true;
    return typeof window.GARDEN_VISIBLE === 'function' ? !!window.GARDEN_VISIBLE() : true;
  }
  setInterval(() => { btn.classList.toggle('hidden', !visible()); }, 400);
  setInterval(() => { if (!document.hidden && visible()) refreshBadge(); }, 30000);
  setTimeout(refreshBadge, 800);
  window.GARDEN_REFRESH = refreshBadge;

  btn.onclick = open;

  function frame(inner) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'garden-screen';
      document.body.appendChild(overlay);
      document.body.classList.add('garden-open');
    }
    overlay.innerHTML = `<div class="garden-box" role="dialog" aria-label="내 보관함">
      <div class="garden-head"><h2>🧺 내 보관함</h2><button class="back" data-close>닫기</button></div>${inner}</div>`;
    overlay.querySelector('[data-close]').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
  }
  function close() {
    overlay?.remove();
    overlay = null;
    document.body.classList.remove('garden-open');
    refreshBadge();
  }

  function open() {
    const m = me();
    if (!m) return askWho();
    load(m);
  }

  // 허브에서 처음 열면 반·번호를 묻는다(문제풀이 화면과 같은 저장 이름을 쓴다)
  function askWho(cls) {
    if (!cls) {
      frame(`<p class="garden-sub">몇 반인가요?</p><div class="garden-cls">${CLASSES.map((c) => `<button class="st-btn" data-c="${c}">${c}반</button>`).join('')}</div>`);
      overlay.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => askWho(b.dataset.c); });
      return;
    }
    frame(`<p class="garden-sub">${cls}반 · 내 번호를 눌러요</p><div class="garden-nums">${Array.from({ length: MAX_NUMBER }, (_, i) => `<button class="num-btn" data-n="${i + 1}">${i + 1}</button>`).join('')}</div>`);
    overlay.querySelectorAll('[data-n]').forEach((b) => {
      b.onclick = () => { const m = { cls, num: Number(b.dataset.n) }; ss.set('tp-me', m); load(m); };
    });
  }

  async function load(m, msg) {
    if (!data || data.cls !== m.cls || data.num !== m.num) frame('<div class="empty">불러오는 중…</div>');
    try {
      data = await api(`/api/garden?cls=${encodeURIComponent(m.cls)}&num=${m.num}`);
      paint(m, msg);
    } catch (e) {
      frame(`<div class="msg">${esc(e.message)}</div>`);
    }
  }

  function paint(m, msg) {
    const d = data;
    const apples = d.basket > 0
      ? `${'🍎'.repeat(Math.min(d.basket, 24))}${d.basket > 24 ? ` <b>+${d.basket - 24}</b>` : ''}`
      : '<span class="garden-empty">아직 수확한 사과가 없어요</span>';
    const cards = d.units.map((u) => {
      const tip = u.ready > 0 ? ''
        : u.n === 0 && !u.harvested ? '문제를 풀면 씨앗에서 싹이 터요.'
          : window.treeApples(u.n, u.max) === 0 ? `나무가 다 자라면 사과가 열려요. (맞힌 문제 ${u.n} / ${u.max})`
            : '열린 사과를 모두 수확했어요. 재응시에서 더 맞히면 더 열려요.';
      return `<div class="garden-card">
        <div class="garden-tree">${window.treeSvg(u.n, u.max, u.ready)}</div>
        <div class="garden-info">
          <b>${icon(u.id)} ${esc(u.title)}</b>
          <span>${esc(window.treeName(u.n, u.max))} · 맞힌 문제 ${u.n} / ${u.max}</span>
          <span>수확한 사과 🍎 ${u.harvested}개${u.fbDone ? ` <small>(피드백 보너스 ${u.fbDone}개 포함)</small>` : ''}</span>
          ${u.ready > 0 ? `<button class="st-btn go harvest" data-u="${u.id}">🍎 사과 ${u.ready}개 수확하기</button>` : `<span class="garden-tip">${tip}</span>`}
        </div></div>`;
    }).join('');
    frame(`<div class="garden-who">${m.cls}반 ${m.num}번 ${inUnit ? '' : '<button class="link-btn" data-who>내 번호가 아니에요</button>'}</div>
      ${msg ? `<div class="garden-pop">${msg}</div>` : ''}
      <div class="garden-basket"><div class="garden-basket-head">🧺 바구니 <b>${d.basket}개</b></div><div class="garden-apples">${apples}</div></div>
      <div class="garden-list">${cards}</div>
      <p class="garden-rule">1·2단계에서 맞힌 문제만큼 나무가 자라요. 다 자란 나무에는 사과가 열리고(최대 8개), 피드백 문제를 끝내면 사과 1개를 더 받아요.</p>`);
    overlay.querySelector('[data-who]')?.addEventListener('click', () => askWho());
    overlay.querySelectorAll('.harvest').forEach((b) => {
      b.onclick = async () => {
        b.disabled = true;
        try {
          const r = await api('/api/garden', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cls: m.cls, num: m.num, unit: b.dataset.u }) });
          data = r;
          paint(m, `🎉 사과 ${r.picked}개를 수확해서 바구니에 담았어요!`);
        } catch (e) {
          b.disabled = false;
          b.textContent = e.message;
        }
      };
    });
  }
})();
