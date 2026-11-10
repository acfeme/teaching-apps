(function () {
  const CLASSES = ['2-1', '2-2', '2-3', '2-4'];
  const MAX_NUMBER = 35;
  const POLL_MS = 5000;
  const RANK_POLL_MS = 15000;
  const WARN_GAP_MS = 3000;
  const ST = window.STAGES;
  const app = document.getElementById('app');

  const S = {
    screen: '', cls: null, num: null, stage: null, startedAt: null, attempt: 0,
    i: 0, blank: 0, answers: {}, warns: 0,
  };
  let timer = null;
  let lastWarnAt = 0;

  // ---- 공통 ----
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const M = (s) => window.mathHtml(s);
  const stopTimer = () => { if (timer) { clearInterval(timer); timer = null; } };
  const every = (ms, fn) => { stopTimer(); fn(); timer = setInterval(() => { if (!document.hidden) fn(); }, ms); };
  const ls = {
    get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 불가 기기 */ } },
    del: (k) => { try { localStorage.removeItem(k); } catch (e) { /* 저장 불가 기기 */ } },
  };
  const ss = {
    get: (k) => { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 불가 기기 */ } },
    del: (k) => { try { sessionStorage.removeItem(k); } catch (e) { /* 저장 불가 기기 */ } },
  };
  async function api(path, opts) {
    let r;
    try { r = await fetch(path, { cache: 'no-store', ...opts }); } catch (e) {
      throw new Error('인터넷 연결을 확인하고 다시 눌러 주세요.');
    }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || '잠시 후 다시 시도해 주세요.'); e.code = d.code; throw e; }
    return d;
  }
  const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  const draftKey = () => `tp-draft:${S.cls}:${S.num}:${S.stage}:${S.startedAt}`;
  const resultKey = (stage) => `tp-result:${S.cls}:${S.num}:${stage}`;
  const items = () => ST[S.stage].items;
  const isDone = (p) => {
    const a = S.answers[p.id] || [];
    for (let k = 0; k < window.blankCount(p); k++) if (!a[k]) return false;
    return true;
  };

  // ---- 1. 반 선택 (선생님이 연 반만 들어갈 수 있음) ----
  function showClasses() {
    S.screen = 'classes';
    ss.del('tp-me');
    app.innerHTML = `<div class="wrap">
      <h1 class="title">삼각형과 평행선</h1>
      <div class="sub">우리 반을 눌러 주세요. 선생님이 열어 준 반만 들어갈 수 있어요.</div>
      <div class="class-grid">${CLASSES.map((c) => `<button class="class-btn" data-c="${c}" disabled>${c}반<span class="lock">확인 중…</span></button>`).join('')}</div>
      <div class="msg hidden" id="msg"></div>
    </div>`;
    app.querySelectorAll('[data-c]').forEach((b) => {
      b.onclick = () => { if (!b.disabled) { S.cls = b.dataset.c; showNumbers(); } };
    });
    every(POLL_MS, async () => {
      try {
        const d = await api('/api/state');
        if (S.screen !== 'classes') return;
        app.querySelectorAll('[data-c]').forEach((b) => {
          const open = !!d.open[b.dataset.c];
          b.disabled = !open;
          b.querySelector('.lock').textContent = open ? '들어가기' : '🔒 잠김';
        });
        app.querySelector('#msg').classList.add('hidden');
      } catch (e) {
        const m = app.querySelector('#msg');
        if (m) { m.textContent = e.message; m.classList.remove('hidden'); }
      }
    });
  }

  // ---- 2. 번호 선택 ----
  function showNumbers() {
    stopTimer();
    S.screen = 'numbers';
    const nums = Array.from({ length: MAX_NUMBER }, (_, k) => k + 1);
    app.innerHTML = `<div class="wrap">
      <div class="head-row"><div><h1 class="title">${S.cls}반</h1><div class="sub">내 번호를 눌러 주세요.</div></div>
      <button class="back" id="back">반 다시 고르기</button></div>
      <div class="num-grid">${nums.map((n) => `<button class="num-btn" data-n="${n}">${n}</button>`).join('')}</div>
    </div>`;
    app.querySelector('#back').onclick = showClasses;
    app.querySelectorAll('[data-n]').forEach((b) => {
      b.onclick = () => { S.num = Number(b.dataset.n); ss.set('tp-me', { cls: S.cls, num: S.num }); showHome(); };
    });
    window.scrollTo(0, 0);
  }

  // ---- 3. 내 화면: 사과나무와 단계 ----
  function showHome() {
    S.screen = 'home';
    app.innerHTML = `<div class="wrap">
      <div class="head-row"><h1 class="title">${S.cls}반 ${S.num}번</h1>
        <button class="back" id="back">내 번호가 아니에요</button></div>
      <div class="home-grid">
        <div class="tree-card"><div id="tree"></div><div class="tree-cap" id="treeCap"></div></div>
        <div class="stage-list" id="stages"><div class="empty">불러오는 중…</div></div>
      </div>
    </div>`;
    app.querySelector('#back').onclick = showClasses;
    window.scrollTo(0, 0);
    let first = true;
    every(POLL_MS, async () => {
      try {
        const d = await api(`/api/state?cls=${encodeURIComponent(S.cls)}&num=${S.num}`);
        if (S.screen !== 'home') return;
        paintTree(d.tree);
        paintStages(d);
        first = false;
      } catch (e) {
        if (first && S.screen === 'home') app.querySelector('#stages').innerHTML = `<div class="msg">${esc(e.message)}</div>`;
      }
    });
  }

  function paintTree(n) {
    app.querySelector('#tree').innerHTML = window.treeSvg(n);
    app.querySelector('#treeCap').innerHTML = `<b>${window.treeName(n)}</b><span>맞힌 문제 ${n} / ${window.TREE_MAX}</span>`;
  }

  function paintStages(d) {
    const box = app.querySelector('#stages');
    box.innerHTML = [1, 2].map((no) => {
      const info = d.stages[no];
      const stg = ST[no];
      const saved = ls.get(resultKey(no));
      let body = '';
      if (info.status === 'locked') {
        body = `<div class="st-note">🔒 선생님이 열어 주시면 시작할 수 있어요.</div><button class="st-btn" disabled>잠김</button>`;
      } else if (info.status === 'ready') {
        body = `<button class="st-btn go" data-start="${no}">${info.attempt > 0 ? '재응시 시작하기' : '시작하기'}</button>`;
      } else if (info.status === 'active') {
        body = `<div class="st-note">풀던 문제가 있어요.</div><button class="st-btn go" data-start="${no}">이어서 풀기</button>`;
      } else {
        body = `<div class="st-score">${info.last ? `${info.last.score}점 <small>(${info.last.correct}/${info.last.total} 정답)</small>` : '완료'}</div>
          <div class="st-note">다시 풀려면 선생님께 재응시를 요청하세요.</div>
          ${saved ? `<button class="st-btn" data-view="${no}">결과 다시 보기</button>` : ''}`;
      }
      return `<div class="stage-card ${info.status}">
        <div class="st-head"><h2>${stg.title}</h2><span class="st-count">${stg.items.length}문제</span></div>
        <div class="st-desc">${stg.desc}</div>${body}<div class="msg hidden" data-err="${no}"></div></div>`;
    }).join('');
    box.querySelectorAll('[data-start]').forEach((b) => { b.onclick = () => startStage(Number(b.dataset.start), b); });
    box.querySelectorAll('[data-view]').forEach((b) => {
      b.onclick = () => { const r = ls.get(resultKey(Number(b.dataset.view))); if (r) showResult({ ...r, prevTree: r.tree }); };
    });
  }

  async function startStage(no, btn) {
    btn.disabled = true;
    try {
      const d = await post('/api/start', { cls: S.cls, num: S.num, stage: no });
      S.stage = no; S.startedAt = d.startedAt; S.attempt = d.attempt;
      S.i = 0; S.blank = 0; S.warns = 0;
      const draft = ls.get(draftKey()) || {};
      S.answers = draft.answers || {};
      S.warns = draft.warns || 0;
      showQuiz();
    } catch (e) {
      btn.disabled = false;
      const m = app.querySelector(`[data-err="${no}"]`);
      if (m) { m.textContent = e.message; m.classList.remove('hidden'); }
    }
  }

  // ---- 4. 문제 풀이 ----
  function showQuiz() {
    stopTimer();
    S.screen = 'quiz';
    const varKeys = S.stage === 1;
    app.innerHTML = `<div class="quiz">
      <div class="topbar">
        <div class="who">${S.cls}반 ${S.num}번 · ${S.stage}단계</div>
        <div class="prog" id="prog"></div>
        <button class="submit-top" id="submit">제출하기</button>
      </div>
      <div class="quiz-main">
        <div class="pcard" id="card"></div>
        <div class="side">
          <div class="keys" id="keys">
            ${key('7')}${key('8')}${key('9')}<button class="key fn" data-k="back" aria-label="지우기">⌫</button>
            ${key('4')}${key('5')}${key('6')}${key('.')}
            ${key('1')}${key('2')}${key('3')}${key('/')}
            ${varKeys ? `${key('0')}${key('x', 'var')}${key('y', 'var')}` : '<button class="key wide" data-k="0">0</button><button class="key fn" data-k="clear">지움</button>'}<button class="key fn" data-k="next" aria-label="다음 칸">다음 칸</button>
          </div>
          <div class="tip">${varKeys ? '빈칸에는 수나 문자 x, y를 넣어요. ' : ''}분수는 20/3처럼 입력해요.</div>
          <div class="navs">
            <button class="nav" id="prev">이전 문제</button>
            <button class="nav primary" id="next">다음 문제</button>
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
  const key = (k, cls = '') => `<button class="key ${cls}" data-k="${k}">${k}</button>`;

  function boxHtml(p, k) {
    const v = S.answers[p.id]?.[k] || '';
    const shown = /^[xy]$/.test(v) ? `<i class="v">${v}</i>` : esc(v);
    return `<button class="box${k === S.blank ? ' on' : ''}" data-b="${k}" aria-label="빈칸 ${k + 1}">${shown}</button>`;
  }

  function stepsHtml(p, cell) {
    let k = 0;
    return `<ol class="steps">${p.steps.map((s) => {
      const parts = s.eq.split('@');
      const eq = parts.map((t, i) => M(t) + (i < parts.length - 1 ? cell(k++) : '')).join('');
      return `<li>${s.guide ? `<div class="guide">${M(s.guide)}</div>` : ''}<div class="eq">${eq}</div></li>`;
    }).join('')}</ol>`;
  }

  function renderProblem() {
    const p = items()[S.i];
    const body = p.steps
      ? `<div class="step-title">풀이 순서대로 빈칸을 채워 보세요</div>${stepsHtml(p, (k) => boxHtml(p, k))}`
      : `<div class="blanks">${p.blanks.map((b, k) => `<div class="blank"><span>${M(b.label)}</span><span>=</span>${boxHtml(p, k)}${b.unit ? `<span class="unit">${b.unit}</span>` : ''}</div>`).join('')}</div>`;
    app.querySelector('#card').innerHTML = `
      <div class="sec">${esc(p.sec)}</div>
      <div class="src">${S.i + 1}번 · ${esc(p.src)}</div>
      <div class="pbody">
        <div class="ptext">${M(p.text)}</div>
        <div class="pfig">${window.figureSvg(p.fig)}</div>
      </div>${body}`;
    app.querySelectorAll('[data-b]').forEach((b) => {
      b.onclick = () => { S.blank = Number(b.dataset.b); paintBoxes(); };
    });
    app.querySelector('#prev').disabled = S.i === 0;
    app.querySelector('#next').disabled = S.i === items().length - 1;
    paintProgress();
    paintStrip();
  }

  function paintBoxes() {
    const p = items()[S.i];
    app.querySelectorAll('[data-b]').forEach((b) => {
      const k = Number(b.dataset.b);
      const v = S.answers[p.id]?.[k] || '';
      b.classList.toggle('on', k === S.blank);
      b.innerHTML = /^[xy]$/.test(v) ? `<i class="v">${v}</i>` : esc(v);
    });
    const on = app.querySelector('.box.on');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
  }

  function paintProgress() {
    const done = items().filter(isDone).length;
    app.querySelector('#prog').innerHTML = `<b>${S.i + 1}</b> / ${items().length}번<span class="prog-more"> · 완성 ${done}개</span>`;
  }

  function paintStrip() {
    app.querySelector('#strip').innerHTML = items().map((p, k) => `<button class="dot${isDone(p) ? ' done' : ''}${k === S.i ? ' cur' : ''}" data-go="${k}">${k + 1}</button>`).join('');
    app.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => go(Number(b.dataset.go)); });
  }

  function go(i) {
    if (i < 0 || i >= items().length) return;
    S.i = i; S.blank = 0;
    renderProblem();
    window.scrollTo({ top: 0 });
  }

  function saveDraft() { ls.set(draftKey(), { answers: S.answers, warns: S.warns }); }

  function press(k) {
    const p = items()[S.i];
    const n = window.blankCount(p);
    if (k === 'next') {
      if (S.blank < n - 1) { S.blank++; paintBoxes(); } else if (S.i < items().length - 1) go(S.i + 1);
      return;
    }
    const list = S.answers[p.id] || Array.from({ length: n }, () => '');
    let v = list[S.blank] || '';
    const isVar = /^[xy]$/.test(v);
    if (k === 'back') v = isVar ? '' : v.slice(0, -1);
    else if (k === 'clear') v = '';
    else if (k === 'x' || k === 'y') v = k;
    else if (k === '.') { if (isVar) v = '0.'; else if (!v.includes('.') && !v.includes('/')) v = (v || '0') + '.'; }
    else if (k === '/') { if (!isVar && v && !v.includes('/') && !v.includes('.')) v += '/'; }
    else if (isVar) v = k;
    else if (v.length < 8) v += k;
    list[S.blank] = v;
    S.answers[p.id] = list;
    saveDraft();
    paintBoxes(); paintProgress(); paintStrip();
    if ((k === 'x' || k === 'y') && S.blank < n - 1) { S.blank++; paintBoxes(); }
  }

  document.addEventListener('keydown', (e) => {
    if (S.screen !== 'quiz' || document.querySelector('.modal, .warn-screen')) return;
    if (/^[0-9./]$/.test(e.key)) press(e.key);
    else if (S.stage === 1 && /^[xyXY]$/.test(e.key)) press(e.key.toLowerCase());
    else if (e.key === 'Backspace') { e.preventDefault(); press('back'); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); press('next'); }
    else if (e.key === 'ArrowRight') go(S.i + 1);
    else if (e.key === 'ArrowLeft') go(S.i - 1);
  });

  // ---- 다른 창 경고 ----
  function flagLeave(kind) {
    if (S.screen !== 'quiz') return;
    const now = Date.now();
    if (now - lastWarnAt < WARN_GAP_MS) return;
    lastWarnAt = now;
    S.warns++;
    saveDraft();
    try {
      fetch('/api/warn', {
        method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cls: S.cls, num: S.num, stage: S.stage, kind }),
      }).catch(() => {});
    } catch (e) { /* 경고 기록 실패는 화면 경고만 남김 */ }
    showWarn();
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) flagLeave('hidden'); });
  window.addEventListener('blur', () => flagLeave('blur'));

  function showWarn() {
    let w = document.querySelector('.warn-screen');
    if (!w) {
      w = document.createElement('div');
      w.className = 'warn-screen';
      document.body.appendChild(w);
    }
    w.innerHTML = `<div class="warn-box">
      <div class="warn-icon">⚠</div>
      <h2>다른 창을 열었어요!</h2>
      <p>문제를 푸는 동안 다른 인터넷 창이나 앱을 열면 안 돼요.<br>이 일은 선생님 화면에 바로 기록되었어요.</p>
      <div class="warn-count">경고 ${S.warns}회</div>
      <button id="warnOk">확인했어요. 계속 풀게요</button></div>`;
    w.querySelector('#warnOk').onclick = () => w.remove();
  }

  // ---- 제출 ----
  function askSubmit() {
    const blank = items().filter((p) => !isDone(p)).length;
    const msg = blank
      ? `아직 다 채우지 않은 문제가 ${blank}개 있어요.<br>제출하면 다시 풀 수 없어요. 그래도 제출할까요?`
      : '제출하면 다시 풀 수 없어요. 제출할까요?';
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
        const data = await post('/api/submit', { cls: S.cls, num: S.num, stage: S.stage, answers: S.answers, warnings: S.warns });
        ls.del(draftKey());
        ls.set(resultKey(S.stage), data);
        m.remove();
        S.screen = 'result';
        showResult(data);
      } catch (e) {
        if (e.code === 'NOT_ACTIVE') { m.remove(); ls.del(draftKey()); showHome(); return; }
        err.textContent = e.message;
        err.classList.remove('hidden');
        yes.disabled = false; yes.textContent = '다시 제출';
      }
    };
  }

  // ---- 5. 결과: 점수, 사과나무, 문제별 피드백, 순위 ----
  function showResult(R) {
    stopTimer();
    S.screen = 'result';
    const stg = ST[R.stage];
    const list = stg.items;
    const grown = R.tree - R.prevTree;
    app.innerHTML = `<div class="wrap">
      <div class="head-row"><h1 class="title">${S.cls}반 ${S.num}번 · ${R.stage}단계 결과</h1>
        <button class="back" id="home">처음 화면으로</button></div>
      <div class="result-top">
        <div class="score-card">
          <div class="score">${R.score}<small>점</small></div>
          <div class="sub">${R.total}문제 중 ${R.correct}문제 정답</div>
          <div class="ox-grid">${list.map((p, k) => `<a class="ox ${R.feedback[p.id].ok ? 'y' : 'n'}" href="#fb-${p.id}">${k + 1}<b>${R.feedback[p.id].ok ? 'O' : 'X'}</b></a>`).join('')}</div>
        </div>
        <div class="tree-card"><div id="tree"></div><div class="tree-cap" id="treeCap"></div>
          <div class="grow-msg">${grown > 0 ? `🌱 ${grown}문제를 맞혀서 나무가 자랐어요!` : '다음 단계에서 나무를 키워 봐요.'}</div></div>
      </div>
      <h2 class="fb-title">문제별 피드백</h2>
      <div class="fb-list">${list.map((p, k) => feedbackHtml(p, k, R)).join('')}</div>
      <div class="rank-grid">
        <div class="rank-card"><h3>${S.cls}반 순위 (상위 5위)</h3><div id="cr"><div class="empty">불러오는 중…</div></div></div>
        <div class="rank-card"><h3>오늘 전체 순위 (상위 10위)</h3><div id="or"><div class="empty">불러오는 중…</div></div></div>
      </div>
      <div class="sub center">순위 점수는 1단계와 2단계 점수의 합(200점 만점)이에요.</div>
    </div>`;
    app.querySelector('#home').onclick = showHome;
    window.scrollTo(0, 0);
    growTree(R.prevTree, R.tree);
    every(RANK_POLL_MS, loadRanks);
  }

  function growTree(from, to) {
    let n = from;
    paintTree(n);
    if (to <= from) return;
    const t = setInterval(() => {
      if (S.screen !== 'result' || !app.querySelector('#tree')) { clearInterval(t); return; }
      n++;
      paintTree(n);
      if (n >= to) clearInterval(t);
    }, 450);
  }

  function chip(given, answer, ok) {
    const fmt = (v) => (/^[xy]$/.test(v) ? `<i class="v">${v}</i>` : esc(v || '빈칸'));
    return ok
      ? `<span class="chip y">${fmt(answer)}</span>`
      : `<span class="chip n"><s>${fmt(given)}</s> → ${fmt(answer)}</span>`;
  }

  function feedbackHtml(p, k, R) {
    const fb = R.feedback[p.id];
    const given = R.answers?.[p.id] || [];
    const head = `<div class="fb-head"><span class="fb-no ${fb.ok ? 'y' : 'n'}">${k + 1}번 ${fb.ok ? 'O' : 'X'}</span><span class="src">${esc(p.src)}</span></div>`;
    if (fb.ok) {
      return `<div class="fb ok" id="fb-${p.id}">${head}<div class="fb-ok">정답이에요! 👍</div></div>`;
    }
    const work = p.steps
      ? stepsHtml(p, (i) => chip(given[i], fb.answer[i], fb.blanks[i]))
      : `<div class="blanks">${p.blanks.map((b, i) => `<div class="blank small"><span>${M(b.label)}</span><span>=</span>${chip(given[i], fb.answer[i], fb.blanks[i])}${b.unit ? `<span class="unit">${b.unit}</span>` : ''}</div>`).join('')}</div>`;
    return `<div class="fb bad" id="fb-${p.id}">${head}
      <div class="fb-body"><div class="fb-text">
        <div class="ptext small">${M(p.text)}</div>
        ${work}
        <div class="fb-explain"><b>이렇게 생각해요</b> ${M(fb.explain)}</div>
      </div><div class="pfig small">${window.figureSvg(p.fig)}</div></div></div>`;
  }

  async function loadRanks() {
    try {
      const d = await api(`/api/ranking?cls=${encodeURIComponent(S.cls)}`);
      const cr = app.querySelector('#cr'); const or = app.querySelector('#or');
      if (!cr || !or) return;
      const row = (x, showCls) => {
        const me = x.cls === S.cls && x.num === S.num;
        return `<div class="rank-row${x.rank <= 3 ? ' top' : ''}${me ? ' me' : ''}"><span class="rank-no">${x.rank}</span>
          <span class="rank-name">${showCls ? `${x.cls}반 ` : ''}${x.num}번</span><span class="rank-score">${x.total}점</span></div>`;
      };
      cr.innerHTML = d.classTop.map((x) => row(x, false)).join('') || '<div class="empty">아직 기록이 없어요.</div>';
      or.innerHTML = d.overallTop.map((x) => row(x, true)).join('') || '<div class="empty">아직 기록이 없어요.</div>';
    } catch (e) {
      const cr = app.querySelector('#cr');
      if (cr && cr.querySelector('.empty')) cr.innerHTML = '<div class="empty">순위를 불러오지 못했어요.</div>';
    }
  }

  // 새로 고침해도 같은 학생 화면으로 돌아온다(브라우저 탭을 닫으면 처음부터)
  const me = ss.get('tp-me');
  if (me && CLASSES.includes(me.cls) && me.num >= 1 && me.num <= MAX_NUMBER) {
    S.cls = me.cls; S.num = me.num;
    showHome();
  } else {
    showClasses();
  }
})();
