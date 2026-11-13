// 게임 랭킹 화면(모든 게임이 함께 쓴다): 내 기록, 우리 반 오늘 실시간 상위 5명, 전체 학생 누적 상위 10명.
// 학생은 로그인(engine/me.js의 ME: 반·번호 + 비밀번호)으로 구분하고, 랭킹에는 번호 대신 별명만 보인다.
// RANK.submit('shoot', 점수) → 기록 저장, RANK.open('match') → 랭킹 화면
window.RANK = (function () {
  const CLASSES = ['2-1', '2-2', '2-3', '2-4', '2-A', '2-B', '2-C']; // 2-A·2-B·2-C = 외부 체험용 샘플반
  const MAX_NUMBER = 35;
  const GAMES = [
    { id: 'match', icon: '🃏', title: '닮음비 짝맞추기', unit: '초', note: '짧은 시간일수록 높은 순위' },
    { id: 'shoot', icon: '🎯', title: '닮음 조건 쏘기', unit: '점', note: '높은 점수일수록 높은 순위' },
    { id: 'right', icon: '👾', title: '직각 몬스터 쪼개기', unit: '점', note: '높은 점수일수록 높은 순위' },
    { id: 'dungeon', icon: '🗝️', title: '평행선 던전 탐험', unit: '점', note: '높은 점수일수록 높은 순위' },
    { id: 'cspeed', icon: '⚖️', title: '무게중심 스피드 퀴즈', unit: '초', note: '짧은 기록(시간 + 벌점)일수록 높은 순위' },
  ];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const css = document.createElement('style');
  css.textContent = `
  .rk-screen{position:fixed;inset:0;z-index:100;background:rgba(20,30,40,.5);display:flex;justify-content:center;align-items:flex-start;overflow-y:auto;padding:18px 14px;font-family:"Pretendard","Noto Sans KR","Malgun Gothic",sans-serif;color:#1c2230;line-height:1.45}
  .rk-box{width:100%;max-width:820px;background:#fff8ec;border-radius:22px;padding:18px;box-shadow:0 12px 40px rgba(0,0,0,.25)}
  .rk-head{display:flex;justify-content:space-between;align-items:center;gap:10px}
  .rk-head h2{margin:0;font-size:26px}
  .rk-x{min-height:46px;padding:0 18px;border-radius:12px;border:2px solid #ead9bd;background:#fff;font:inherit;font-weight:800;font-size:18px;cursor:pointer}
  .rk-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
  .rk-tab{min-height:46px;padding:0 16px;border-radius:12px;border:2px solid #ead9bd;background:#fff;font:inherit;font-weight:800;font-size:17px;cursor:pointer}
  .rk-tab.on{background:#e08a1e;border-color:#e08a1e;color:#fff}
  .rk-me{background:#fff;border:2px solid #f0d49a;border-radius:16px;padding:12px 14px;display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;font-size:18px}
  .rk-me b{color:#a85e05;font-size:22px}
  .rk-grid{display:grid;grid-template-columns:1fr 1.2fr;gap:12px;margin-top:12px}
  .rk-card{background:#fff;border:2px solid #ead9bd;border-radius:16px;padding:12px}
  .rk-card h3{margin:0 0 8px;font-size:19px}
  .rk-row{display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:10px;font-size:18px}
  .rk-row:nth-child(odd){background:#fdf6ea}
  .rk-row.me{background:#fff0c7;font-weight:800}
  .rk-no{width:34px;height:34px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:#eee;font-weight:900;flex:none}
  .rk-row.top1 .rk-no{background:#ffd54a}.rk-row.top2 .rk-no{background:#d9dee5}.rk-row.top3 .rk-no{background:#f0b98a}
  .rk-name{flex:1;display:flex;align-items:center;gap:6px}.rk-av{display:inline-flex;flex:none}.rk-val{font-weight:900;color:#a85e05}
  .rk-empty{color:#6b7588;padding:8px}
  .rk-note{color:#6b7588;font-size:15px;margin:10px 0 0}
  .rk-live{display:inline-block;width:9px;height:9px;border-radius:50%;background:#e0402a;margin-right:6px;animation:rk-blink 1.2s infinite}
  @keyframes rk-blink{50%{opacity:.25}}
  .rk-pick{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:10px}
  .rk-nums{display:grid;grid-template-columns:repeat(auto-fill,minmax(62px,1fr));gap:8px;margin-top:10px}
  .rk-pick button,.rk-nums button{min-height:58px;border-radius:14px;border:2px solid #ead9bd;background:#fff;font:inherit;font-weight:800;font-size:22px;cursor:pointer}
  @media (max-width:640px){.rk-grid{grid-template-columns:1fr}}`;
  document.head.appendChild(css);

  const ss = {
    get: (k) => { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 불가 */ } },
  };
  function me() { return window.ME.get(); }

  let box = null, timer = null;
  function frame(html) {
    if (!box) { box = document.createElement('div'); box.className = 'rk-screen'; document.body.appendChild(box); }
    box.innerHTML = `<div class="rk-box">${html}</div>`;
    box.onclick = (e) => { if (e.target === box) close(); };
    box.querySelector('[data-x]')?.addEventListener('click', close);
  }
  function close() { clearInterval(timer); timer = null; box?.remove(); box = null; if (askDone) { const f = askDone; askDone = null; f(null); } }

  // 로그인(반·번호·비밀번호)은 engine/me.js가 맡는다
  let askDone = null;
  function ask(reason) { close(); return window.ME.login(reason); }

  async function api(path, opts) {
    const r = await fetch(path, { cache: 'no-store', ...opts, headers: { ...((opts && opts.headers) || {}), ...window.ME.headers() } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { if (d.code === 'LOGIN') window.ME.logout(); const e = new Error(d.error || '잠시 후 다시 시도해 주세요.'); e.code = d.code; throw e; }
    return d;
  }

  // 게임이 끝나면 기록 저장(반·번호를 모르면 먼저 묻는다)
  async function submit(game, value) {
    const send = () => api('/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game, value }) });
    let m = me();
    if (!m) m = await ask('기록을 랭킹에 올리려면 반·번호를 고르고 비밀번호를 넣어요.');
    if (!m) return null;
    try { return await send(); } catch (e) {
      if (e.code !== 'LOGIN') throw e;
      m = await ask('다시 확인할게요. 반·번호를 고르고 비밀번호를 넣어요.');
      return m ? send() : null;
    }
  }

  async function open(game) {
    let m = me();
    if (!m) m = await ask('내 기록과 우리 반 순위를 보려면 반·번호를 고르고 비밀번호를 넣어요.');
    if (!m) return;
    let cur = game || GAMES[0].id;
    const fmt = (g, v) => (v == null ? '—' : `${v}${g.unit}`);
    async function paint() {
      const g = GAMES.find((x) => x.id === cur);
      let d;
      try { d = await api(`/api/game?game=${cur}&cls=${encodeURIComponent(m.cls)}`); } catch (e) { d = null; }
      if (!box) return;
      const row = (r, showCls) => `<div class="rk-row ${r.rank <= 3 ? `top${r.rank}` : ''} ${r.me ? 'me' : ''}"><span class="rk-no">${r.rank}</span><span class="rk-name">${r.av && window.AVATAR ? `<span class="rk-av">${window.AVATAR.svg(r.av, 34)}</span>` : ''}${showCls ? `${r.cls}반 ` : ''}${esc(r.nick)}</span><span class="rk-val">${fmt(g, r.value)}</span></div>`;
      frame(`<div class="rk-head"><h2>🏆 게임 랭킹</h2><button class="rk-x" data-x>닫기</button></div>
        <div class="rk-tabs">${GAMES.map((x) => `<button class="rk-tab ${x.id === cur ? 'on' : ''}" data-g="${x.id}">${x.icon} ${x.title}</button>`).join('')}</div>
        ${d ? `${d.me ? `<div class="rk-me"><span>🙋 <b style="font-size:20px">${esc(m.nick || '')}</b></span><span>내 최고 <b>${fmt(g, d.me.best)}</b>${d.me.overallRank ? ` (전체 ${d.me.overallRank}등)` : ''}</span><span>오늘 <b>${fmt(g, d.me.today)}</b>${d.me.classRank ? ` (반 ${d.me.classRank}등)` : ''}</span><span>한 판 수 ${d.me.plays}</span></div>` : ''}
        <div class="rk-grid">
          <div class="rk-card"><h3><span class="rk-live"></span>${m.cls}반 오늘 순위 (5등까지)</h3>${d.classToday.map((r) => row(r, false)).join('') || '<div class="rk-empty">오늘 아직 기록이 없어요.</div>'}</div>
          <div class="rk-card"><h3>🌏 전체 학생 누적 순위 (10등까지)</h3>${d.overall.map((r) => row(r, true)).join('') || '<div class="rk-empty">아직 기록이 없어요.</div>'}</div>
        </div>
        <p class="rk-note">${g.note}. 반 순위는 오늘 기록으로 실시간으로 바뀌고, 전체 순위는 지금까지의 최고 기록으로 매겨요. 랭킹에는 번호 대신 별명만 보여요.</p>` : '<div class="rk-empty">랭킹을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.</div>'}`);
      box.querySelectorAll('[data-g]').forEach((b) => { b.onclick = () => { cur = b.dataset.g; paint(); }; });
    }
    frame('<div class="rk-empty">불러오는 중…</div>');
    await paint();
    clearInterval(timer);
    timer = setInterval(() => { if (box && !document.hidden) paint(); }, 5000);
  }

  return { me, ask, submit, open };
})();
