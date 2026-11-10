// 허브 화면: 닮음 탐구 교실의 유닛 카드 목록.
// 학생용(/)은 문제풀이 유닛으로 들어가고, 교사용(/admin, HUB_MODE='admin')은 유닛별 관리자 화면으로 들어간다.
(function () {
  const app = document.getElementById('app');
  const isAdmin = window.HUB_MODE === 'admin';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const units = window.UNIT_LIST;
  const group = (kind) => units.filter((u) => u.kind === kind);

  function card(u) {
    if (u.kind === 'soon') {
      return `<div class="unit-card is-soon"><div class="u-icon">${u.icon}</div><div class="u-body"><b>${esc(u.title)}</b><span>${esc(u.desc)}</span></div><span class="u-tag">준비 중</span></div>`;
    }
    if (u.kind === 'link') {
      return `<a class="unit-card is-link" href="${esc(u.url)}" target="_blank" rel="noopener"><div class="u-icon">${u.icon}</div><div class="u-body"><b>${esc(u.title)}</b><span>${esc(u.desc)}</span></div><span class="u-tag">열기 ↗</span></a>`;
    }
    const href = isAdmin ? `/admin/${u.id}` : `/u/${u.id}`;
    return `<a class="unit-card is-quiz" href="${href}"><div class="u-icon">${u.icon}</div><div class="u-body"><b>${esc(u.title)}</b><span>${esc(u.desc)}</span>
      <span class="u-open" data-open="${u.id}"></span></div><span class="u-tag go">${isAdmin ? '관리하기' : '들어가기'} →</span></a>`;
  }

  function render() {
    const quiz = group('quiz'), link = group('link'), soon = group('soon');
    app.innerHTML = `<div class="wrap">
      <header class="hub-head">
        <div class="hub-kicker">${isAdmin ? '교사 관리자' : '중학교 2학년 · 닮음'}</div>
        <h1 class="hub-title">${esc(window.SITE.title)}</h1>
        <p class="hub-sub">${isAdmin ? '관리할 유닛을 고르세요. 비밀번호는 한 번만 넣으면 모든 유닛에 쓰여요.' : '오늘 공부할 유닛을 골라 들어가세요. 문제풀이는 선생님이 반을 열어 주시면 시작할 수 있어요.'}</p>
      </header>
      <section><h2 class="hub-h2">✏️ 문제풀이</h2><div class="unit-grid">${quiz.map(card).join('')}</div></section>
      ${link.length ? `<section><h2 class="hub-h2">📚 수업 자료</h2><div class="unit-grid">${link.map(card).join('')}</div></section>` : ''}
      ${soon.length ? `<section><h2 class="hub-h2">🌱 곧 열려요</h2><div class="unit-grid">${soon.map(card).join('')}</div></section>` : ''}
      ${isAdmin ? '<p class="hub-foot"><a href="/">학생 첫 화면 보기</a></p>' : ''}
    </div>`;
    loadOpen(quiz);
  }

  // 문제풀이 유닛마다 지금 열린 반을 보여 준다
  async function loadOpen(quiz) {
    await Promise.all(quiz.map(async (u) => {
      const el = app.querySelector(`[data-open="${u.id}"]`);
      try {
        const r = await fetch(`/api/state?unit=${encodeURIComponent(u.id)}`, { cache: 'no-store' });
        const d = await r.json();
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

  render();
  setInterval(() => { if (!document.hidden) loadOpen(group('quiz')); }, 10000);
})();
