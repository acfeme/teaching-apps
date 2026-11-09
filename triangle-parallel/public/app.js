(function () {
  const CLASSES = ['2-1', '2-2', '2-3', '2-4'];
  const MAX_NUMBER = 35;
  const RANK_POLL_MS = 15000;
  const P = window.PROBLEMS;
  const app = document.getElementById('app');

  const S = { cls: null, num: null, i: 0, blank: 0, answers: {}, result: null };
  let rankTimer = null;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const draftKey = () => `tp-draft:${S.cls}:${S.num}`;
  const saveDraft = () => { try { localStorage.setItem(draftKey(), JSON.stringify(S.answers)); } catch (e) { /* 저장 불가 기기 */ } };
  const loadDraft = () => { try { return JSON.parse(localStorage.getItem(draftKey())) || {}; } catch (e) { return {}; } };
  const clearDraft = () => { try { localStorage.removeItem(draftKey()); } catch (e) { /* 저장 불가 기기 */ } };

  const isDone = (p) => p.blanks.every((_, k) => (S.answers[p.id]?.[k] || '').length > 0);
  const stopRank = () => { if (rankTimer) { clearInterval(rankTimer); rankTimer = null; } };

  // ---- 1. 반 선택 ----
  function showClasses() {
    stopRank();
    S.cls = null; S.num = null;
    app.innerHTML = `<div class="wrap">
      <h1 class="title">삼각형과 평행선</h1>
      <div class="sub">우리 반을 눌러 주세요.</div>
      <div class="class-grid">${CLASSES.map((c) => `<button class="class-btn" data-c="${c}">${c}반</button>`).join('')}</div>
    </div>`;
    app.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => { S.cls = b.dataset.c; showNumbers(); }; });
  }

  // ---- 2. 번호 선택 ----
  function showNumbers() {
    const nums = Array.from({ length: MAX_NUMBER }, (_, k) => k + 1);
    app.innerHTML = `<div class="wrap">
      <div class="head-row"><div><h1 class="title">${S.cls}반</h1><div class="sub">내 번호를 눌러 주세요.</div></div>
      <button class="back" id="back">반 다시 고르기</button></div>
      <div class="num-grid">${nums.map((n) => `<button class="num-btn" data-n="${n}">${n}</button>`).join('')}</div>
    </div>`;
    app.querySelector('#back').onclick = showClasses;
    app.querySelectorAll('[data-n]').forEach((b) => {
      b.onclick = () => {
        S.num = Number(b.dataset.n); S.i = 0; S.blank = 0; S.answers = loadDraft();
        showQuiz();
      };
    });
    window.scrollTo(0, 0);
  }

  // ---- 3. 문제 풀이 ----
  function showQuiz() {
    stopRank();
    app.innerHTML = `<div class="quiz">
      <div class="topbar">
        <div class="who">${S.cls}반 ${S.num}번</div>
        <div class="prog" id="prog"></div>
        <button class="submit-top" id="submit">제출하기</button>
      </div>
      <div class="quiz-main">
        <div class="pcard" id="card"></div>
        <div class="side">
          <div class="keys" id="keys">
            ${['7', '8', '9'].map(key).join('')}<button class="key fn" data-k="back" aria-label="지우기">⌫</button>
            ${['4', '5', '6'].map(key).join('')}${key('.')}
            ${['1', '2', '3'].map(key).join('')}${key('/')}
            <button class="key wide" data-k="0">0</button><button class="key fn wide" data-k="clear">모두 지우기</button>
          </div>
          <div class="tip">분수는 20/3처럼 입력해요.</div>
          <div class="navs">
            <button class="nav" id="prev">이전</button>
            <button class="nav primary" id="next">다음</button>
          </div>
        </div>
      </div>
      <div class="strip" id="strip"></div>
    </div>`;
    app.querySelector('#keys').addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]');
      if (b) press(b.dataset.k);
    });
    app.querySelector('#prev').onclick = () => go(S.i - 1);
    app.querySelector('#next').onclick = () => go(S.i + 1);
    app.querySelector('#submit').onclick = askSubmit;
    renderProblem();
    window.scrollTo(0, 0);
  }
  const key = (k) => `<button class="key" data-k="${k}">${k}</button>`;

  function renderProblem() {
    const p = P[S.i];
    const a = S.answers[p.id] || [];
    app.querySelector('#card').innerHTML = `
      <div class="sec">${esc(p.sec)}</div>
      <div class="src">${esc(p.src)}</div>
      <div class="pbody">
        <div class="ptext">${window.mathHtml(p.text)}</div>
        <div class="pfig">${window.figureSvg(p.fig)}</div>
      </div>
      <div class="blanks">${p.blanks.map((b, k) => `
        <div class="blank"><span>${window.mathHtml(b.label)}</span><span>=</span>
          <button class="box${k === S.blank ? ' on' : ''}" data-b="${k}" aria-label="답 입력 칸">${esc(a[k] || '')}</button>
          ${b.unit ? `<span class="unit">${b.unit}</span>` : ''}
        </div>`).join('')}</div>`;
    app.querySelectorAll('[data-b]').forEach((b) => {
      b.onclick = () => { S.blank = Number(b.dataset.b); paintBoxes(); };
    });
    app.querySelector('#prev').disabled = S.i === 0;
    app.querySelector('#next').disabled = S.i === P.length - 1;
    paintProgress();
    paintStrip();
  }

  function paintBoxes() {
    const p = P[S.i];
    app.querySelectorAll('[data-b]').forEach((b) => {
      const k = Number(b.dataset.b);
      b.classList.toggle('on', k === S.blank);
      b.textContent = S.answers[p.id]?.[k] || '';
    });
  }

  function paintProgress() {
    const done = P.filter(isDone).length;
    app.querySelector('#prog').innerHTML = `<b>${S.i + 1}</b> / ${P.length}번<span class="prog-more"> · 입력 ${done}개</span>`;
  }

  function paintStrip() {
    app.querySelector('#strip').innerHTML = P.map((p, k) => `<button class="dot${isDone(p) ? ' done' : ''}${k === S.i ? ' cur' : ''}" data-go="${k}">${k + 1}</button>`).join('');
    app.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => go(Number(b.dataset.go)); });
  }

  function go(i) {
    if (i < 0 || i >= P.length) return;
    S.i = i; S.blank = 0;
    renderProblem();
    window.scrollTo({ top: 0 });
  }

  function press(k) {
    const p = P[S.i];
    const list = S.answers[p.id] || p.blanks.map(() => '');
    let v = list[S.blank] || '';
    if (k === 'back') v = v.slice(0, -1);
    else if (k === 'clear') v = '';
    else if (k === '.') { if (!v.includes('.') && !v.includes('/')) v = (v || '0') + '.'; }
    else if (k === '/') { if (v && !v.includes('/') && !v.includes('.')) v += '/'; }
    else if (v.length < 8) v += k;
    list[S.blank] = v;
    S.answers[p.id] = list;
    saveDraft();
    paintBoxes(); paintProgress(); paintStrip();
  }

  document.addEventListener('keydown', (e) => {
    if (!app.querySelector('#keys') || document.querySelector('.modal')) return;
    if (/^[0-9./]$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') { e.preventDefault(); press('back'); }
    else if (e.key === 'ArrowRight') go(S.i + 1);
    else if (e.key === 'ArrowLeft') go(S.i - 1);
    else if (e.key === 'Tab') {
      e.preventDefault();
      const n = P[S.i].blanks.length;
      S.blank = (S.blank + 1) % n; paintBoxes();
    }
  });

  function askSubmit() {
    const blank = P.filter((p) => !isDone(p)).length;
    const msg = blank ? `아직 답을 넣지 않은 문항이 ${blank}개 있어요. 그래도 제출할까요?` : '제출할까요?';
    const m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = `<div class="modal-box"><p>${msg}</p><div class="msg hidden" id="err"></div>
      <div class="modal-acts"><button id="no">계속 풀기</button><button class="ok" id="yes">제출</button></div></div>`;
    document.body.appendChild(m);
    m.querySelector('#no').onclick = () => m.remove();
    const yes = m.querySelector('#yes');
    yes.onclick = async () => {
      yes.disabled = true; yes.textContent = '보내는 중…';
      const err = m.querySelector('#err');
      try {
        const r = await fetch('/api/submit', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cls: S.cls, num: S.num, answers: S.answers }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || '제출하지 못했습니다.');
        S.result = data;
        clearDraft();
        m.remove();
        showResult();
      } catch (e) {
        err.textContent = e.message === 'Failed to fetch' ? '인터넷 연결을 확인하고 다시 눌러 주세요.' : e.message;
        err.classList.remove('hidden');
        yes.disabled = false; yes.textContent = '다시 제출';
      }
    };
  }

  // ---- 4. 결과와 순위 ----
  function showResult() {
    const R = S.result;
    app.innerHTML = `<div class="wrap">
      <div class="head-row"><h1 class="title">${S.cls}반 ${S.num}번 결과</h1>
      <button class="back" id="home">처음으로</button></div>
      <div class="score-card">
        <div class="score">${R.score}<small>점</small></div>
        <div class="sub">${R.total}문항 중 ${R.correct}문항 정답</div>
        <div class="ox-grid">${P.map((p, k) => {
          const ok = R.results[p.id];
          return `<div class="ox ${ok ? 'y' : 'n'}">${k + 1}<b>${ok ? 'O' : 'X'}</b></div>`;
        }).join('')}</div>
        <div class="btn-row"><button class="big-btn" id="again">다시 풀기</button></div>
      </div>
      <div class="rank-grid">
        <div class="rank-card"><h3>${S.cls}반 순위 (상위 5위)</h3><div id="cr"><div class="empty">불러오는 중…</div></div></div>
        <div class="rank-card"><h3>오늘 전체 순위 (상위 10위)</h3><div id="or"><div class="empty">불러오는 중…</div></div></div>
      </div>
    </div>`;
    app.querySelector('#home').onclick = showClasses;
    app.querySelector('#again').onclick = () => { S.answers = {}; S.i = 0; S.blank = 0; showQuiz(); };
    window.scrollTo(0, 0);
    loadRanks();
    rankTimer = setInterval(() => { if (!document.hidden) loadRanks(); }, RANK_POLL_MS);
  }

  async function loadRanks() {
    try {
      const r = await fetch(`/api/ranking?cls=${encodeURIComponent(S.cls)}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const row = (x, showCls) => {
        const me = x.cls === S.cls && x.num === S.num;
        return `<div class="rank-row${x.rank <= 3 ? ' top' : ''}${me ? ' me' : ''}"><span class="rank-no">${x.rank}</span>
          <span class="rank-name">${showCls ? `${x.cls}반 ` : ''}${x.num}번</span><span class="rank-score">${x.score}점</span></div>`;
      };
      const cr = app.querySelector('#cr'); const or = app.querySelector('#or');
      if (!cr || !or) return;
      cr.innerHTML = d.classTop.map((x) => row(x, false)).join('') || '<div class="empty">아직 기록이 없어요.</div>';
      or.innerHTML = d.overallTop.map((x) => row(x, true)).join('') || '<div class="empty">아직 기록이 없어요.</div>';
    } catch (e) {
      const cr = app.querySelector('#cr');
      if (cr && cr.querySelector('.empty')) cr.innerHTML = '<div class="empty">순위를 불러오지 못했어요.</div>';
    }
  }

  showClasses();
})();
