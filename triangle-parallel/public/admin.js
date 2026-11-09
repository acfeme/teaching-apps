(function () {
  const POLL_MS = 4000;
  const CLASSES = ['2-1', '2-2', '2-3', '2-4'];
  const P = window.PROBLEMS;
  const app = document.getElementById('app');
  const KEY = 'tp-admin';
  const st = { pw: '', date: '', scope: 'all', data: null, timer: null, showBest: false };

  const fmtTime = (ms) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(ms);
  const clsName = (c) => (c === 'all' ? '전체' : `${c}반`);

  function savedPw() { try { return sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function setPw(v) { try { if (v) sessionStorage.setItem(KEY, v); else sessionStorage.removeItem(KEY); } catch (e) { /* 저장 불가 */ } }

  function showLogin(msg) {
    if (st.timer) { clearInterval(st.timer); st.timer = null; }
    app.innerHTML = `<form class="login" id="f">
      <h1 class="title" style="font-size:28px">교사 관리자</h1>
      <input id="pw" type="password" autocomplete="current-password" placeholder="비밀번호" aria-label="비밀번호">
      <button>입장</button>
      ${msg ? `<div class="err">${msg}</div>` : ''}
    </form>`;
    app.querySelector('#f').onsubmit = (e) => {
      e.preventDefault();
      st.pw = app.querySelector('#pw').value;
      start();
    };
    app.querySelector('#pw').focus();
  }

  async function fetchData() {
    const q = st.date ? `?date=${encodeURIComponent(st.date)}` : '';
    const r = await fetch(`/api/admin${q}`, { headers: { 'x-admin-password': st.pw }, cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 || r.status === 429) { const e = new Error(d.error); e.auth = true; throw e; }
    if (!r.ok) throw new Error(d.error || '불러오지 못했습니다.');
    return d;
  }

  async function start() {
    try {
      st.data = await fetchData();
      st.date = st.data.date;
      setPw(st.pw);
      render();
      st.timer = setInterval(tick, POLL_MS);
    } catch (e) {
      setPw('');
      showLogin(e.message);
    }
  }

  async function tick() {
    if (document.hidden) return;
    try {
      st.data = await fetchData();
      paint();
      setLive(true);
    } catch (e) {
      if (e.auth) { setPw(''); showLogin(e.message); } else setLive(false);
    }
  }

  function setLive(ok) {
    const el = app.querySelector('#live');
    if (el) el.innerHTML = ok ? `<b>실시간</b> · ${fmtTime(Date.now())} 갱신` : '연결이 끊겨 다시 시도 중…';
  }

  function render() {
    app.innerHTML = `<div class="wrap">
      <div class="head-row"><h1 class="title" style="font-size:30px">삼각형과 평행선 · 풀이 결과</h1>
      <button class="back" id="out">나가기</button></div>
      <div class="toolbar">
        <select id="date" aria-label="날짜"></select>
        <div class="tabs" id="tabs">${['all', ...CLASSES].map((c) => `<button class="tab" data-s="${c}">${clsName(c)}</button>`).join('')}</div>
        <div class="live" id="live"></div>
      </div>
      <div id="body"></div>
    </div>`;
    app.querySelector('#out').onclick = () => { setPw(''); st.pw = ''; st.date = ''; showLogin(); };
    app.querySelector('#date').onchange = async (e) => {
      st.date = e.target.value;
      try { st.data = await fetchData(); paint(); } catch (err) { setLive(false); }
    };
    app.querySelector('#tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-s]');
      if (b) { st.scope = b.dataset.s; paint(); }
    });
    paint();
    setLive(true);
  }

  function paint() {
    const d = st.data;
    const sel = app.querySelector('#date');
    sel.innerHTML = d.dates.map((x) => `<option value="${x}"${x === d.date ? ' selected' : ''}>${x}${x === d.today ? ' (오늘)' : ''}</option>`).join('');
    app.querySelectorAll('[data-s]').forEach((b) => b.classList.toggle('on', b.dataset.s === st.scope));
    const sc = d.scopes[st.scope];
    const rows = d.detail.filter((s) => st.scope === 'all' || s.cls === st.scope);
    const log = d.log.filter((s) => st.scope === 'all' || s.cls === st.scope);

    const rates = P.map((p, k) => {
      const r = sc.rates[p.id];
      return `<div class="rate"><div class="no">${k + 1}</div><div class="lab" title="${p.src}">${p.src}</div>
        <div class="track"><div class="fill${r.n && r.rate < 50 ? ' low' : ''}" style="width:${r.rate}%"></div></div>
        <div class="val">${r.rate}% (${r.correct}/${r.n})</div></div>`;
    }).join('');

    const rankCol = (title, list, showCls) => `<div><h3>${title}</h3>${list.map((x) => `<div class="r"><span>${x.rank}</span><span>${showCls ? `${x.cls}반 ` : ''}${x.num}번</span><span>${x.score}</span></div>`).join('') || '<div class="empty">기록 없음</div>'}</div>`;

    const body = app.querySelector('#body');
    const keepScroll = window.scrollY;
    body.innerHTML = `
      <div class="tiles">
        <div class="tile"><div>제출 학생</div><b>${sc.students}</b>명</div>
        <div class="tile"><div>총 제출 횟수</div><b>${sc.submissions}</b>회</div>
        <div class="tile"><div>첫 제출 평균</div><b>${sc.avgFirst}</b>점</div>
      </div>
      <div class="panel"><h2>순위 (전체 표시)</h2>
        <div class="note">학생별 그날 최고 점수 기준, 동점이면 그 점수를 먼저 낸 학생이 앞입니다.</div>
        <div class="ranks">
          ${rankCol('전체', d.scopes.all.ranking, true)}
          ${CLASSES.map((c) => rankCol(`${c}반`, d.scopes[c].ranking, false)).join('')}
        </div>
      </div>
      <div class="panel"><h2>${clsName(st.scope)} 문항별 정답률</h2>
        <div class="note">학생별 그날 첫 제출 기준입니다. 50% 미만은 주황색입니다.</div>
        ${rates}
      </div>
      <div class="panel"><h2>${clsName(st.scope)} 학생별 문항 결과</h2>
        <div class="note">첫 제출의 문항별 정답 여부입니다.</div>
        <div class="scroll"><table><thead><tr><th>반</th><th>번호</th><th>첫 점수</th><th>최고</th><th>횟수</th><th>첫 제출</th>${P.map((_, k) => `<th>${k + 1}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((s) => `<tr><td>${s.cls}</td><td>${s.num}</td><td>${s.firstScore}</td><td>${s.bestScore}</td><td>${s.attempts}</td><td>${fmtTime(s.firstAt)}</td>${P.map((p) => (s.first[p.id] ? '<td class="o">O</td>' : '<td class="x">X</td>')).join('')}</tr>`).join('') || `<tr><td colspan="${6 + P.length}">아직 제출이 없습니다.</td></tr>`}</tbody></table></div>
      </div>
      <div class="panel"><h2>제출 기록</h2>
        <div class="scroll" style="max-height:360px;overflow-y:auto"><table><thead><tr><th>제출 시각</th><th>반</th><th>번호</th><th>점수</th><th>정답 수</th></tr></thead>
        <tbody>${log.map((r) => `<tr><td>${fmtTime(r.submittedAt)}</td><td>${r.cls}</td><td>${r.num}</td><td>${r.score}</td><td>${r.correct}/${r.total}</td></tr>`).join('') || '<tr><td colspan="5">아직 제출이 없습니다.</td></tr>'}</tbody></table></div>
      </div>`;
    window.scrollTo(0, keepScroll);
  }

  st.pw = savedPw();
  if (st.pw) start(); else showLogin();
})();
