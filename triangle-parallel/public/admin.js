(function () {
  const POLL_MS = 5000;
  const DATES_EVERY = 12; // 12번 갱신마다 날짜 목록도 새로
  const CLASSES = ['2-1', '2-2', '2-3', '2-4'];
  const ST = window.STAGES;
  const app = document.getElementById('app');
  const KEY = 'tp-admin';
  const st = { pw: '', date: '', scope: 'all', data: null, dates: [], timer: null, tick: 0, seen: null, busy: false };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtTime = (ms) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(ms);
  const clsName = (c) => (c === 'all' ? '전체' : `${c}반`);
  const savedPw = () => { try { return sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; } };
  const setPw = (v) => { try { if (v) sessionStorage.setItem(KEY, v); else sessionStorage.removeItem(KEY); } catch (e) { /* 저장 불가 */ } };
  const wKey = (w) => `${w.at}-${w.cls}-${w.num}`;

  function showLogin(msg) {
    if (st.timer) { clearInterval(st.timer); st.timer = null; }
    app.innerHTML = `<form class="login" id="f">
      <h1 class="title" style="font-size:28px">교사 관리자</h1>
      <input id="pw" type="password" autocomplete="current-password" placeholder="비밀번호" aria-label="비밀번호">
      <button>입장</button>
      ${msg ? `<div class="err">${esc(msg)}</div>` : ''}
    </form>`;
    app.querySelector('#f').onsubmit = (e) => { e.preventDefault(); st.pw = app.querySelector('#pw').value; start(); };
    app.querySelector('#pw').focus();
  }

  async function call(method, body, withDates) {
    const q = method === 'GET' ? `?date=${encodeURIComponent(st.date || '')}${withDates ? '&dates=1' : ''}` : '';
    const r = await fetch(`/api/admin${q}`, {
      method, cache: 'no-store',
      headers: { 'x-admin-password': st.pw, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 || r.status === 429) { const e = new Error(d.error); e.auth = true; throw e; }
    if (!r.ok) throw new Error(d.error || '처리하지 못했습니다.');
    return d;
  }

  async function start() {
    try {
      const d = await call('GET', null, true);
      setPw(st.pw);
      st.date = d.date;
      st.dates = d.dates;
      st.seen = new Set(d.warnings.map(wKey)); // 들어오기 전 경고는 알림으로 띄우지 않음
      st.data = d;
      render();
      st.timer = setInterval(refresh, POLL_MS);
    } catch (e) {
      setPw('');
      showLogin(e.message);
    }
  }

  async function refresh() {
    if (document.hidden || st.busy) return;
    try {
      st.tick++;
      const d = await call('GET', null, st.tick % DATES_EVERY === 0);
      if (d.dates) st.dates = d.dates;
      st.data = d;
      paint();
      setLive(true);
    } catch (e) {
      if (e.auth) { setPw(''); showLogin(e.message); } else setLive(false);
    }
  }

  async function act(body, btn) {
    if (btn) btn.disabled = true;
    st.busy = true;
    try {
      await call('POST', body);
      st.busy = false;
      st.data = await call('GET');
      paint();
    } catch (e) {
      st.busy = false;
      if (e.auth) { setPw(''); showLogin(e.message); return; }
      toast(`처리하지 못했습니다: ${e.message}`);
      if (btn) btn.disabled = false;
    }
  }

  function setLive(ok) {
    const el = app.querySelector('#live');
    if (el) el.innerHTML = ok ? `<b>실시간</b> · ${fmtTime(Date.now())} 갱신` : '연결이 끊겨 다시 시도 중…';
  }

  // ---- 경고 알림 ----
  function toast(text, isWarn) {
    const box = document.querySelector('#alerts');
    if (!box) return;
    const el = document.createElement('div');
    el.className = `alert${isWarn ? ' warn' : ''}`;
    el.innerHTML = `<span>${text}</span><button aria-label="닫기">확인</button>`;
    el.querySelector('button').onclick = () => el.remove();
    box.prepend(el);
    while (box.children.length > 6) box.lastChild.remove();
  }

  function newWarnings(list) {
    if (st.data.date !== st.data.today) return;
    const fresh = list.filter((w) => !st.seen.has(wKey(w)));
    fresh.forEach((w) => st.seen.add(wKey(w)));
    fresh.reverse().forEach((w) => toast(`⚠ <b>${w.cls}반 ${w.num}번</b> · ${w.stage}단계 풀이 중 ${esc(w.label || '다른 창으로 이동')} <small>${fmtTime(w.at)}</small>`, true));
  }

  // ---- 화면 ----
  function render() {
    app.innerHTML = `<div id="alerts" class="alerts"></div><div class="wrap">
      <div class="head-row"><h1 class="title" style="font-size:30px">삼각형과 평행선 · 교사 관리자</h1>
      <button class="back" id="out">나가기</button></div>
      <div class="panel"><h2>수업 열기·잠그기</h2>
        <div class="note">학생은 <b>입장</b>이 열린 반만 들어올 수 있고, 각 단계는 열린 동안에만 <b>시작</b>할 수 있어요. 이미 시작한 학생은 단계를 잠가도 제출할 수 있어요.</div>
        <div class="scroll"><table class="ctl"><thead><tr><th>반</th><th>입장</th><th>1단계</th><th>2단계</th></tr></thead><tbody id="ctl"></tbody></table></div>
      </div>
      <div class="toolbar">
        <div class="tabs" id="tabs">${['all', ...CLASSES].map((c) => `<button class="tab" data-s="${c}">${clsName(c)}</button>`).join('')}</div>
        <div class="live" id="live"></div>
      </div>
      <div class="panel"><h2 id="stuTitle">학생 현황</h2>
        <div class="note">지금 상태입니다. 다시 풀게 하려면 <b>재응시 허용</b>을 누르세요. 이전 기록은 날짜별로 그대로 남아요. 경고 수는 오늘 기준이에요.</div>
        <div class="bulk" id="bulk"></div>
        <div class="scroll"><table><thead><tr><th>반</th><th>번호</th><th>1단계</th><th>2단계</th><th>경고</th><th>재응시</th></tr></thead><tbody id="stu"></tbody></table></div>
      </div>
      <div class="panel"><h2>오늘 다른 창 경고 기록</h2><div class="scroll warn-log" id="wlog"></div></div>
      <div class="toolbar"><label class="date-pick">기록 날짜 <select id="date" aria-label="날짜"></select></label></div>
      <div id="body"></div>
    </div>`;
    app.querySelector('#out').onclick = () => { setPw(''); st.pw = ''; st.date = ''; showLogin(); };
    app.querySelector('#date').onchange = async (e) => {
      st.date = e.target.value;
      try { st.data = await call('GET'); paint(); } catch (err) { setLive(false); }
    };
    app.querySelector('#tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-s]');
      if (b) { st.scope = b.dataset.s; paint(); }
    });
    app.addEventListener('click', (e) => {
      const t = e.target.closest('[data-cfg]');
      if (t) { const [cls, keyName] = t.dataset.cfg.split('|'); act({ action: 'cfg', cls, key: keyName, value: t.dataset.on !== '1' }, t); return; }
      const r = e.target.closest('[data-retake]');
      if (r) { const [cls, num, stage] = r.dataset.retake.split('|'); act({ action: 'retake', cls, num: Number(num), stage: Number(stage) }, r); return; }
      const ra = e.target.closest('[data-retakeall]');
      if (ra) confirmRetakeAll(ra);
    });
    paint();
    setLive(true);
  }

  function confirmRetakeAll(btn) {
    const [cls, stage] = btn.dataset.retakeall.split('|');
    const m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = `<div class="modal-box"><p>${cls}반에서 ${stage}단계를 이미 푼 학생 모두에게 재응시를 허용할까요?<br><small>이전 기록은 지워지지 않아요.</small></p>
      <div class="modal-acts"><button id="no">취소</button><button class="ok" id="yes">모두 허용</button></div></div>`;
    document.body.appendChild(m);
    m.querySelector('#no').onclick = () => m.remove();
    m.querySelector('#yes').onclick = () => { m.remove(); act({ action: 'retakeAll', cls, stage: Number(stage) }, btn); };
  }

  const sw = (cls, keyName, on, label) => `<button class="sw${on ? ' on' : ''}" data-cfg="${cls}|${keyName}" data-on="${on ? 1 : 0}" aria-pressed="${on}">
    <span class="knob"></span><span>${on ? `${label} 열림` : '잠김'}</span></button>`;

  function stageCell(a) {
    if (!a) return '<span class="tag">미응시</span>';
    if (a.active) return `<span class="tag live">풀이 중 <small>${fmtTime(a.active.startedAt)}~</small></span>`;
    if (a.used < a.allowed) return a.used === 0 ? '<span class="tag">미응시</span>' : `<span class="tag ok">재응시 가능</span> <small>직전 ${a.last?.score ?? '-'}점</small>`;
    return `<span class="tag done">완료 ${a.last?.score ?? '-'}점</span> <small>${a.used}회</small>`;
  }

  function paint() {
    const d = st.data;
    newWarnings(d.warnings);

    app.querySelector('#ctl').innerHTML = CLASSES.map((c) => {
      const v = d.cfg[c];
      return `<tr><td><b>${c}반</b></td><td>${sw(c, 'open', v.open, '입장')}</td><td>${sw(c, 's1', v.s1, '1단계')}</td><td>${sw(c, 's2', v.s2, '2단계')}</td></tr>`;
    }).join('');

    app.querySelectorAll('[data-s]').forEach((b) => b.classList.toggle('on', b.dataset.s === st.scope));
    app.querySelector('#stuTitle').textContent = `${clsName(st.scope)} 학생 현황`;
    app.querySelector('#bulk').innerHTML = st.scope === 'all' ? '' : [1, 2].map((s) => `<button class="mini" data-retakeall="${st.scope}|${s}">${st.scope}반 ${s}단계 모두 재응시 허용</button>`).join('');
    const rows = d.students.filter((s) => st.scope === 'all' || s.cls === st.scope);
    app.querySelector('#stu').innerHTML = rows.map((s) => {
      const btn = (n) => {
        const a = s.stages[n];
        const can = a && !a.active && a.used >= a.allowed;
        return `<button class="mini" data-retake="${s.cls}|${s.num}|${n}"${can ? '' : ' disabled'}>${n}단계</button>`;
      };
      return `<tr class="${s.warnings ? 'warned' : ''}"><td>${s.cls}</td><td>${s.num}</td><td>${stageCell(s.stages[1])}</td><td>${stageCell(s.stages[2])}</td>
        <td>${s.warnings ? `<b class="wcount">⚠ ${s.warnings}</b>` : '0'}</td><td>${btn(1)} ${btn(2)}</td></tr>`;
    }).join('') || '<tr><td colspan="6">아직 들어온 학생이 없습니다.</td></tr>';

    const wl = d.warnings.filter((w) => st.scope === 'all' || w.cls === st.scope);
    app.querySelector('#wlog').innerHTML = wl.length
      ? `<table><thead><tr><th>시각</th><th>반</th><th>번호</th><th>단계</th><th>내용</th></tr></thead><tbody>${wl.map((w) => `<tr><td>${fmtTime(w.at)}</td><td>${w.cls}</td><td>${w.num}</td><td>${w.stage}</td><td>${esc(w.label || '')}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">경고가 없습니다.</div>';

    const sel = app.querySelector('#date');
    sel.innerHTML = (st.dates || [d.date]).map((x) => `<option value="${x}"${x === d.date ? ' selected' : ''}>${x}${x === d.today ? ' (오늘)' : ''}</option>`).join('');

    const keep = window.scrollY;
    app.querySelector('#body').innerHTML = recordsHtml(d);
    window.scrollTo(0, keep);
  }

  function recordsHtml(d) {
    const sc = d.scopes[st.scope];
    const log = d.log.filter((r) => st.scope === 'all' || r.cls === st.scope);
    const rankCol = (title, list, showCls) => `<div><h3>${title}</h3>${list.map((x) => `<div class="r"><span>${x.rank}</span><span>${showCls ? `${x.cls}반 ` : ''}${x.num}번</span><span>${x.total}</span></div>`).join('') || '<div class="empty">기록 없음</div>'}</div>`;
    const rates = (no) => ST[no].items.map((p, k) => {
      const r = sc.stages[no].rates[p.id];
      const steps = p.steps ? `<div class="bl">${r.blanks.map((b, i) => `<span class="b${r.n && b < 50 ? ' low' : ''}" title="${i + 1}번째 빈칸">${i + 1}:${b}%</span>`).join('')}</div>` : '';
      return `<div class="rate"><div class="no">${k + 1}</div><div class="lab" title="${esc(p.src)}">${esc(p.src)}</div>
        <div class="track"><div class="fill${r.n && r.rate < 50 ? ' low' : ''}" style="width:${r.rate}%"></div></div>
        <div class="val">${r.rate}% (${r.correct}/${r.n})</div></div>${steps}`;
    }).join('');
    return `
      <div class="tiles">
        <div class="tile"><div>1단계 응시(첫 제출)</div><b>${sc.stages[1].students}</b>명 · 평균 <b>${sc.stages[1].avg}</b>점</div>
        <div class="tile"><div>2단계 응시(첫 제출)</div><b>${sc.stages[2].students}</b>명 · 평균 <b>${sc.stages[2].avg}</b>점</div>
        <div class="tile"><div>총 제출</div><b>${log.length}</b>회</div>
      </div>
      <div class="panel"><h2>순위 (전체 표시, 1·2단계 점수 합)</h2>
        <div class="note">그날 단계별 마지막 제출 점수의 합입니다. 동점이면 먼저 도달한 학생이 앞입니다.</div>
        <div class="ranks">${rankCol('전체', d.scopes.all.ranking, true)}${CLASSES.map((c) => rankCol(`${c}반`, d.scopes[c].ranking, false)).join('')}</div>
      </div>
      ${[1, 2].map((no) => `<div class="panel"><h2>${clsName(st.scope)} ${ST[no].title} 문항별 정답률</h2>
        <div class="note">학생별 그날 첫 제출 기준입니다. 50% 미만은 주황색입니다.${no === 1 ? ' 아래 작은 숫자는 풀이 단계(빈칸)별 정답률이에요.' : ''}</div>${rates(no)}</div>`).join('')}
      <div class="panel"><h2>제출 기록</h2>
        <div class="scroll" style="max-height:420px;overflow-y:auto"><table><thead><tr><th>제출 시각</th><th>반</th><th>번호</th><th>단계</th><th>회차</th><th>점수</th><th>정답</th><th>경고</th><th>틀린 문제</th></tr></thead>
        <tbody>${log.map((r) => {
          const wrong = ST[r.stage].items.map((p, k) => (r.results?.[p.id]?.ok ? null : k + 1)).filter(Boolean).join(', ');
          return `<tr><td>${fmtTime(r.submittedAt)}</td><td>${r.cls}</td><td>${r.num}</td><td>${r.stage}</td><td>${r.attempt}</td><td>${r.score}</td><td>${r.correct}/${r.total}</td><td>${r.warnings ? `<b class="wcount">${r.warnings}</b>` : 0}</td><td class="left">${wrong || '-'}</td></tr>`;
        }).join('') || '<tr><td colspan="9">이 날짜에는 제출이 없습니다.</td></tr>'}</tbody></table></div>
      </div>`;
  }

  st.pw = savedPw();
  if (st.pw) start(); else showLogin();
})();
