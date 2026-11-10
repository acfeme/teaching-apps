(function () {
  const POLL_MS = 5000;
  const DATES_EVERY = 12; // 12번 갱신마다 날짜 목록도 새로
  const CLASSES = ['2-1', '2-2', '2-3', '2-4'];
  const ST = window.STAGES;
  const UNIT = window.UNIT; // 지금 유닛
  const fileTitle = UNIT.title.replace(/\s+/g, '');
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
    document.querySelector('.progress-screen')?.remove();
    app.innerHTML = `<form class="login" id="f">
      <h1 class="title" style="font-size:28px">교사 관리자</h1>
      <input id="pw" type="password" autocomplete="current-password" placeholder="비밀번호" aria-label="비밀번호">
      <button>입장</button>
      ${msg ? `<div class="err">${esc(msg)}</div>` : ''}
    </form>`;
    app.querySelector('#f').onsubmit = (e) => { e.preventDefault(); st.pw = app.querySelector('#pw').value; start(); };
    app.querySelector('#pw').focus();
  }

  async function call(method, body, withDates, date) {
    const q = method === 'GET' ? `?date=${encodeURIComponent(date || st.date || '')}${withDates ? '&dates=1' : ''}` : '';
    const r = await fetch(`/api/admin${q}${q ? '&' : '?'}unit=${encodeURIComponent(UNIT.id)}`, {
      method, cache: 'no-store',
      headers: { 'x-admin-password': st.pw, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 || r.status === 429) { const e = new Error(d.error); e.auth = true; throw e; }
    if (!r.ok) throw new Error(d.error || '처리하지 못했습니다.');
    return d;
  }

  // 서버에서 받은 관리자 데이터를 화면에 쓰기 전에 정리한다.
  // - 잠금 변경 번호(lockVer)가 내가 아는 것보다 낮으면 저장 직후 예전 값을 읽은 것이므로 잠금 상태는 무시
  // - 배포 버전(build)이 처음 들어왔을 때와 다르면 새로고침 안내
  function accept(d) {
    if ((d.lockVer ?? 0) < (st.lockVer || 0) && st.data?.cfg) d.cfg = st.data.cfg;
    else st.lockVer = d.lockVer ?? st.lockVer;
    if (d.build) {
      if (!st.build) st.build = d.build;
      else if (d.build !== st.build) showUpdate();
    }
    return d;
  }
  function showUpdate() {
    if (document.querySelector('#upd')) return;
    const el = document.createElement('div');
    el.id = 'upd';
    el.className = 'upd';
    el.innerHTML = '<span>🔄 관리자 화면이 새 버전으로 바뀌었어요. 새로고침해 주세요.</span><button>지금 새로고침</button>';
    el.querySelector('button').onclick = () => location.reload();
    document.body.appendChild(el);
  }

  async function start() {
    try {
      const d = await call('GET', null, true);
      setPw(st.pw);
      accept(d);
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
    if (document.hidden || st.pending || st.drag) return; // 스위치를 만지는 중에는 다시 그리지 않음
    try {
      st.tick++;
      const ver = st.ver;
      const d = await call('GET', null, st.tick % DATES_EVERY === 0);
      if (d.dates) st.dates = d.dates;
      if (st.pending || st.drag || ver !== st.ver) return; // 그 사이 스위치를 바꿨으면 예전 상태로 덮지 않음
      st.data = accept(d);
      paint();
      setLive(true);
    } catch (e) {
      if (e.auth) { setPw(''); showLogin(e.message); } else setLive(false);
    }
  }

  async function act(body, btn) {
    if (btn) btn.disabled = true;
    st.pending = (st.pending || 0) + 1;
    st.ver = (st.ver || 0) + 1;
    try {
      const r = await call('POST', body);
      if (r && r.lockVer) st.lockVer = Math.max(st.lockVer || 0, r.lockVer);
      st.pending--;
      if (st.pending) return; // 다른 변경이 저장 중이면 마지막 것이 끝난 뒤 한 번에 새로 그림
      const ver = st.ver;
      const d = await call('GET');
      if (st.pending || ver !== st.ver) return;
      st.data = accept(d);
      paint();
    } catch (e) {
      st.pending = Math.max(0, st.pending - 1);
      if (e.auth) { setPw(''); showLogin(e.message); return; }
      toast(`처리하지 못했습니다: ${e.message}`);
      if (btn) btn.disabled = false;
    }
  }

  function setLive(ok) {
    const el = app.querySelector('#live');
    if (el) el.innerHTML = ok ? `<b>실시간</b> · ${fmtTime(Date.now())} 갱신` : '연결이 끊겨 다시 시도 중…';
  }

  const stageName = (s) => (s === 'fb' ? '피드백 문제' : `${s}단계`);

  // ---- 경고 알림 ----
  function toast(text, isWarn) {
    const box = document.querySelector('#alerts');
    if (!box) return;
    const el = document.createElement('div');
    el.className = `alert${isWarn ? ' warn' : ''}`;
    el.innerHTML = `<span>${text}</span><button aria-label="닫기">확인</button>`;
    el.querySelector('button').onclick = () => el.remove();
    box.prepend(el);
    if (!isWarn) setTimeout(() => el.remove(), 2500); // 안내 알림은 잠깐만, 경고는 확인을 누를 때까지
    while (box.children.length > 6) box.lastChild.remove();
  }

  function newWarnings(list) {
    if (st.data.date !== st.data.today) return;
    const fresh = list.filter((w) => !st.seen.has(wKey(w)));
    fresh.forEach((w) => st.seen.add(wKey(w)));
    fresh.reverse().forEach((w) => toast(`⚠ <b>${w.cls}반 ${w.num}번</b> · ${stageName(w.stage)} 풀이 중${esc(w.label || '다른 창으로 이동')} <small>${fmtTime(w.at)}</small>`, true));
  }

  // ---- 화면 ----
  function render() {
    app.innerHTML = `<div id="alerts" class="alerts"></div><div class="wrap">
      <div class="head-row"><div><a class="hub-link" href="/admin">← 전체 유닛</a><h1 class="title" style="font-size:30px">${UNIT.title} · 교사 관리자</h1></div>
      <div class="head-acts"><button class="back prog-open" id="progOpen">📊 진도현황</button><button class="back" id="out">나가기</button></div></div>
      <div class="panel"><h2>수업 열기·잠그기</h2>
        <div class="note">학생은 <b>입장</b>이 열린 반만 들어올 수 있고, 각 단계는 열린 동안에만 <b>시작</b>할 수 있어요. 이미 시작한 학생은 단계를 잠가도 제출할 수 있어요.<br><b>피드백 문제</b>는 1단계에서 4문제 이하로 맞힌 학생에게 <b>자동으로</b> 열려요(스위치 없음). 1단계 중 무작위 5문제를 힌트를 보며 모두 맞힐 때까지 풀고, 한 번 끝내면 아래 학생 현황의 <b>피드백</b> 재응시 버튼을 눌러야 다시 풀 수 있어요.</div>
        <div class="scroll"><table class="ctl"><thead><tr><th>반</th><th>입장</th><th>1단계</th><th>2단계</th></tr></thead><tbody id="ctl"></tbody></table></div>
      </div>
      <div class="panel view-pick">
        <div class="vp-row"><span class="vp-step">① 날짜</span><select id="date" aria-label="날짜"></select>
          <button class="mini dl" id="csvSum">📥 학생별 요약 CSV</button><button class="mini dl" id="csvLog">📥 제출 기록 CSV</button><div id="live"></div></div>
        <div class="vp-row"><span class="vp-step">② 반</span><div class="tabs" id="tabs">${['all', ...CLASSES].map((c) => `<button class="tab" data-s="${c}">${clsName(c)}</button>`).join('')}</div></div>
        <div class="note" style="margin:6px 0 0">고른 날짜와 반으로 아래 학생 현황, 다른 창 경고 기록, 문항별 정답률, 제출 기록이 모두 바뀌어요.</div>
      </div>
      <div class="panel"><h2 id="stuTitle">학생 현황</h2>
        <div class="note" id="stuNote"></div>
        <div class="bulk" id="bulk"></div>
        <div class="scroll"><table><thead id="stuHead"></thead><tbody id="stu"></tbody></table></div>
      </div>
      <div class="panel"><h2 id="wTitle">다른 창 경고 기록</h2><div class="scroll warn-log" id="wlog"></div></div>
      <div id="body"></div>
    </div>`;
    app.querySelector('#out').onclick = () => { setPw(''); st.pw = ''; st.date = ''; showLogin(); };
    app.querySelector('#progOpen').onclick = () => progress.open();
    app.querySelector('#csvSum').onclick = () => csv.summary();
    app.querySelector('#csvLog').onclick = () => csv.log();
    app.querySelector('#date').onchange = async (e) => {
      st.date = e.target.value;
      try { st.data = accept(await call('GET')); paint(); } catch (err) { setLive(false); }
    };
    app.querySelector('#tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-s]');
      if (b) { st.scope = b.dataset.s; paint(); }
    });
    bindOnce();
    paint();
    setLive(true);
  }

  // 화면 전체에 거는 처리기는 처음 한 번만 연결한다(다시 로그인해도 겹치지 않게).
  // 스위치는 "손을 댄 그 스위치에서 손을 뗐을 때" 정확히 한 번만 바뀐다.
  //   - 짧게 누름: 열림↔잠김
  //   - 확실한 가로 밀기(30px 이상, 세로보다 2배 이상): 오른쪽 = 열기, 왼쪽 = 잠그기
  //   - 스크롤하려고 움직였거나 다른 곳에서 뗐으면 아무것도 바뀌지 않음
  // 마우스·터치가 만든 클릭은 버리고, 키보드(Enter/Space)로 누른 클릭만 받는다.
  function bindOnce() {
    if (st.bound) return;
    st.bound = true;
    app.addEventListener('pointerdown', (e) => {
      const t = e.target.closest('[data-cfg]');
      st.drag = t && !t.disabled && e.isPrimary ? { t, id: e.pointerId, x: e.clientX, y: e.clientY } : null;
    });
    app.addEventListener('pointerup', (e) => {
      const d = st.drag;
      st.drag = null;
      if (!d || e.pointerId !== d.id) return;
      const up = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-cfg]');
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      const swipe = Math.abs(dx) >= 30 && Math.abs(dx) > 2 * Math.abs(dy);
      if (swipe) { setSwitch(d.t, dx > 0); return; }
      if (Math.abs(dx) > 12 || Math.abs(dy) > 12) return; // 스크롤 등으로 움직임
      if (up !== d.t || !d.t.isConnected) return; // 다른 스위치에서 뗐거나 그 사이 표가 바뀜
      setSwitch(d.t, d.t.dataset.on !== '1');
    });
    app.addEventListener('pointercancel', () => { st.drag = null; });
    app.addEventListener('click', (e) => {
      const t = e.target.closest('[data-cfg]');
      if (t) {
        if (e.detail === 0) setSwitch(t, t.dataset.on !== '1'); // 키보드로 누른 경우만
        return;
      }
      const r = e.target.closest('[data-retake]');
      if (r) { const [cls, num, stage] = r.dataset.retake.split('|'); act({ action: 'retake', cls, num: Number(num), stage: stage === 'fb' ? 'fb' : Number(stage) }, r); return; }
      const ra = e.target.closest('[data-retakeall]');
      if (ra) confirmRetakeAll(ra);
    });
  }

  function confirmRetakeAll(btn) {
    const [cls, stage] = btn.dataset.retakeall.split('|');
    const m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = `<div class="modal-box"><p>${cls}반에서 ${stageName(stage)}를 이미 푼 학생 모두에게 재응시를 허용할까요?<br><small>이전 기록은 지워지지 않아요.</small></p>
      <div class="modal-acts"><button id="no">취소</button><button class="ok" id="yes">모두 허용</button></div></div>`;
    document.body.appendChild(m);
    m.querySelector('#no').onclick = () => m.remove();
    m.querySelector('#yes').onclick = () => { m.remove(); act({ action: 'retakeAll', cls, stage: stage === 'fb' ? 'fb' : Number(stage) }, btn); };
  }

  const SW_LABEL = { open: '입장', s1: '1단계', s2: '2단계', fb: '피드백' };
  const swText = (keyName, on) => (on ? '열림' : '잠김'); // 무엇의 스위치인지는 열 제목에 있다
  const sw = (cls, keyName, on) => `<button class="sw${on ? ' on' : ''}" data-cfg="${cls}|${keyName}" data-on="${on ? 1 : 0}" aria-pressed="${on}" aria-label="${cls}반 ${SW_LABEL[keyName]} ${on ? '열림' : '잠김'}">
    <span class="knob"></span><span class="sw-t">${swText(keyName, on)}</span></button>`;

  // 누르는 즉시 스위치 모양을 바꾸고 서버에 저장한다. 실패하면 서버 상태로 되돌아간다.
  function setSwitch(t, want) {
    if (t.disabled || (t.dataset.on === '1') === want) return;
    const [cls, keyName] = t.dataset.cfg.split('|');
    t.classList.toggle('on', want);
    t.dataset.on = want ? '1' : '0';
    t.setAttribute('aria-pressed', String(want));
    t.querySelector('.sw-t').textContent = swText(keyName, want);
    if (st.data?.cfg?.[cls]) st.data.cfg[cls][keyName] = want; // 화면이 다시 그려져도 방금 바꾼 값 유지
    toast(`${want ? '🔓' : '🔒'} <b>${cls}반 ${SW_LABEL[keyName]}</b>${keyName === 'open' ? '을' : '를'} ${want ? '열었어요' : '잠갔어요'}`);
    act({ action: 'cfg', cls, key: keyName, value: want }, t);
  }

  function stageCell(a) {
    if (!a) return '<span class="tag">미응시</span>';
    if (a.active) return `<span class="tag live">풀이 중 <small>${fmtTime(a.active.startedAt)}~</small></span>`;
    if (a.used < a.allowed) return a.used === 0 ? '<span class="tag">미응시</span>' : `<span class="tag ok">재응시 가능</span> <small>직전 ${a.last?.score ?? '-'}점</small>`;
    return `<span class="tag done">완료 ${a.last?.score ?? '-'}점</span> <small>${a.used}회</small>`;
  }

  // 피드백 문제 진도: 푸는 중이면 문제마다 ●(해결)/○(아직)과 확인 횟수
  function fbCell(f) {
    if (!f || f.status === 'none') return '<span class="tag">-</span>';
    if (f.status === 'active') {
      const it = f.active.items;
      const solved = it.filter((x) => x.solved).length;
      const dots = it.map((x) => {
        const no = ST[1].items.findIndex((p) => p.id === x.id) + 1;
        return `<span class="fbd${x.solved ? ' y' : x.tries ? ' n' : ''}" title="1단계 ${no}번 · 확인 ${x.tries}번">${no}${x.tries ? `<sub>${x.tries}</sub>` : ''}</span>`;
      }).join('');
      return `<span class="tag live">푸는 중 ${solved}/${it.length}</span><div class="fbdots">${dots}</div>`;
    }
    if (f.status === 'ready') return '<span class="tag ok">대상 · 아직 안 함</span>';
    if (f.status === 'again') return `<span class="tag ok">재응시 가능</span> <small>완료 ${f.done}회</small>`;
    return `<span class="tag done">완료 ${f.done}회</span>${f.last ? ` <small>확인 ${f.last.totalTries}번 · 한 번에 ${f.last.firstTry}개</small>` : ''}`;
  }

  function paint() {
    const d = st.data;
    newWarnings(d.warnings);

    app.querySelector('#ctl').innerHTML = CLASSES.map((c) => {
      const v = d.cfg[c];
      return `<tr><td><b>${c}반</b></td><td>${sw(c, 'open', v.open)}</td><td>${sw(c, 's1', v.s1)}</td><td>${sw(c, 's2', v.s2)}</td></tr>`;
    }).join('');

    app.querySelectorAll('[data-s]').forEach((b) => b.classList.toggle('on', b.dataset.s === st.scope));
    const isToday = d.date === d.today;
    const dayName = isToday ? `오늘(${d.date})` : d.date;
    app.querySelector('#stuTitle').textContent = `${dayName} · ${clsName(st.scope)} 학생 현황`;
    app.querySelector('#wTitle').textContent = `${dayName} · ${clsName(st.scope)} 다른 창 경고 기록`;
    if (!isToday) {
      paintPastStudents(d);
    } else {
    app.querySelector('#stuNote').innerHTML = '지금 상태입니다. 다시 풀게 하려면 <b>재응시 허용</b>을 누르세요. 이전 기록은 날짜별로 그대로 남아요. 경고 수는 오늘 기준이에요.';
    app.querySelector('#stuHead').innerHTML = '<tr><th>반</th><th>번호</th><th>1단계</th><th>2단계</th><th>피드백 문제</th><th>경고</th><th>재응시</th></tr>';
    app.querySelector('#bulk').innerHTML = st.scope === 'all' ? '' : [1, 2, 'fb'].map((s) => `<button class="mini" data-retakeall="${st.scope}|${s}">${st.scope}반 ${stageName(s)} 모두 재응시 허용</button>`).join('');
    const rows = d.students.filter((s) => st.scope === 'all' || s.cls === st.scope);
    app.querySelector('#stu').innerHTML = rows.map((s) => {
      const btn = (n) => {
        const a = s.stages[n];
        const can = a && !a.active && a.used >= a.allowed;
        return `<button class="mini" data-retake="${s.cls}|${s.num}|${n}"${can ? '' : ' disabled'}>${n}단계</button>`;
      };
      const fbBtn = s.fb && s.fb.status === 'done'
        ? `<button class="mini" data-retake="${s.cls}|${s.num}|fb">피드백</button>` : '';
      return `<tr class="${s.warnings ? 'warned' : ''}"><td>${s.cls}</td><td>${s.num}</td><td>${stageCell(s.stages[1])}</td><td>${stageCell(s.stages[2])}</td>
        <td>${fbCell(s.fb)}</td><td>${s.warnings ? `<b class="wcount">⚠ ${s.warnings}</b>` : '0'}</td><td>${btn(1)} ${btn(2)} ${fbBtn}</td></tr>`;
    }).join('') || '<tr><td colspan="7">아직 들어온 학생이 없습니다.</td></tr>';
    }

    const wl = d.warnings.filter((w) => st.scope === 'all' || w.cls === st.scope);
    app.querySelector('#wlog').innerHTML = wl.length
      ? `<table><thead><tr><th>시각</th><th>반</th><th>번호</th><th>단계</th><th>내용</th></tr></thead><tbody>${wl.map((w) => `<tr><td>${fmtTime(w.at)}</td><td>${w.cls}</td><td>${w.num}</td><td>${stageName(w.stage)}</td><td>${esc(w.label || '')}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty">${dayName} ${clsName(st.scope)}에는 경고가 없습니다.</div>`;

    const sel = app.querySelector('#date');
    sel.innerHTML = (st.dates || [d.date]).map((x) => `<option value="${x}"${x === d.date ? ' selected' : ''}>${x}${x === d.today ? ' (오늘)' : ''}</option>`).join('');

    const keep = window.scrollY;
    app.querySelector('#body').innerHTML = recordsHtml(d);
    window.scrollTo(0, keep);
  }

  // 지난 날짜: 지금 상태가 아니라 그날 남은 제출·피드백 완료·경고 기록으로 학생 현황을 만든다(재응시 버튼 없음).
  function paintPastStudents(d) {
    app.querySelector('#stuNote').innerHTML = '그날 기록입니다. 점수는 그날 마지막 제출이고, 재응시는 오늘 화면에서만 할 수 있어요.';
    app.querySelector('#stuHead').innerHTML = '<tr><th>반</th><th>번호</th><th>1단계</th><th>2단계</th><th>피드백 문제</th><th>경고</th></tr>';
    app.querySelector('#bulk').innerHTML = '';
    const warnBy = {};
    d.warnings.forEach((w) => { warnBy[`${w.cls}#${w.num}`] = (warnBy[`${w.cls}#${w.num}`] || 0) + 1; });
    const classes = st.scope === 'all' ? CLASSES : [st.scope];
    const html = classes.flatMap((c) => {
      const rows = progress.build(d, c);
      const seen = new Set(rows.map((r) => r.num));
      Object.keys(warnBy).filter((k) => k.startsWith(`${c}#`)).forEach((k) => {
        const n = Number(k.split('#')[1]);
        if (!seen.has(n)) rows.push({ num: n, s: { 1: [], 2: [] }, fbDone: [], fbLive: null, fbTarget: false });
      });
      return rows.sort((a, b) => a.num - b.num).map((r) => {
        const w = warnBy[`${c}#${r.num}`] || 0;
        return `<tr class="${w ? 'warned' : ''}"><td>${c}</td><td>${r.num}</td><td class="left">${progress.stageCell(r, 1)}</td><td class="left">${progress.stageCell(r, 2)}</td>
          <td class="left">${progress.fbCell(r)}</td><td>${w ? `<b class="wcount">⚠ ${w}</b>` : '0'}</td></tr>`;
      });
    }).join('');
    app.querySelector('#stu').innerHTML = html || '<tr><td colspan="6">이 날짜에는 기록이 없습니다.</td></tr>';
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
      </div>
      ${fbLogHtml(d)}`;
  }

  // 피드백 문제 완료 기록: 문제마다 몇 번 만에 맞혔는지
  function fbLogHtml(d) {
    const list = (d.fbLog || []).filter((r) => st.scope === 'all' || r.cls === st.scope);
    const no = Object.fromEntries(ST[1].items.map((p, k) => [p.id, k + 1]));
    return `<div class="panel"><h2>피드백 문제 완료 기록</h2>
      <div class="note">1단계에서 4문제 이하로 맞힌 학생이 1단계 문제 중 무작위 5문제를 모두 맞힐 때까지 푼 기록이에요. 괄호 안은 맞히기까지 확인한 횟수예요(1이면 한 번에 정답).</div>
      <div class="scroll" style="max-height:360px;overflow-y:auto"><table><thead><tr><th>끝낸 시각</th><th>반</th><th>번호</th><th>회차</th><th>한 번에 맞힘</th><th>총 확인</th><th>경고</th><th>문제별 (1단계 번호: 확인 횟수)</th></tr></thead>
      <tbody>${list.map((r) => `<tr><td>${fmtTime(r.finishedAt)}</td><td>${r.cls}</td><td>${r.num}</td><td>${r.round}</td><td>${r.firstTry}/${r.ids.length}</td><td>${r.totalTries}</td>
        <td>${r.warnings ? `<b class="wcount">${r.warnings}</b>` : 0}</td>
        <td class="left">${r.ids.map((id) => `${no[id]}번(${r.tries[id]})`).join(', ')}</td></tr>`).join('') || '<tr><td colspan="8">이 날짜에는 완료 기록이 없습니다.</td></tr>'}</tbody></table></div>
    </div>`;
  }

  // ---- CSV 내려받기: 고른 날짜·반의 기록을 엑셀·구글 시트에서 바로 열 수 있게 ----
  const csv = (() => {
    const cell = (v) => {
      const t = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    function save(name, rows) {
      // 엑셀에서 한글이 깨지지 않도록 BOM을 붙인다
      const text = '\ufeff' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    const scopeName = () => (st.scope === 'all' ? '전체' : `${st.scope}반`);
    const wrongList = (r, n) => (r ? ST[n].items.map((p, k) => (r.results?.[p.id]?.ok ? null : k + 1)).filter(Boolean).join(' ') : '');
    const no1 = (id) => ST[1].items.findIndex((p) => p.id === id) + 1;

    function summary() {
      const d = st.data;
      if (!d) return;
      const warnBy = {};
      d.warnings.forEach((w) => { warnBy[`${w.cls}#${w.num}`] = (warnBy[`${w.cls}#${w.num}`] || 0) + 1; });
      const head = ['날짜', '반', '번호',
        '1단계 점수(마지막)', '1단계 맞힌 수', '1단계 응시 횟수', '1단계 첫 점수', '1단계 틀린 문제',
        '2단계 점수(마지막)', '2단계 맞힌 수', '2단계 응시 횟수', '2단계 첫 점수', '2단계 틀린 문제',
        '합계(1+2단계)', '피드백 대상', '피드백 완료 횟수', '피드백 총 확인 횟수', '피드백 한 번에 맞힘', '피드백 문제별(1단계 번호:확인 횟수)', '다른 창 경고'];
      const rows = [head];
      const classes = st.scope === 'all' ? CLASSES : [st.scope];
      classes.forEach((c) => {
        const list = progress.build(d, c);
        const seen = new Set(list.map((r) => r.num));
        Object.keys(warnBy).filter((k) => k.startsWith(`${c}#`)).forEach((k) => {
          const n = Number(k.split('#')[1]);
          if (!seen.has(n)) list.push({ num: n, s: { 1: [], 2: [] }, fbDone: [], fbTarget: false });
        });
        list.sort((a, b) => a.num - b.num).forEach((r) => {
          const st1 = r.s[1], st2 = r.s[2];
          const l1 = st1[st1.length - 1], l2 = st2[st2.length - 1];
          const fbLast = r.fbDone[r.fbDone.length - 1];
          rows.push([d.date, c, r.num,
            l1?.score ?? '', l1 ? `${l1.correct}/${l1.total}` : '', st1.length || '', st1[0]?.score ?? '', wrongList(l1, 1),
            l2?.score ?? '', l2 ? `${l2.correct}/${l2.total}` : '', st2.length || '', st2[0]?.score ?? '', wrongList(l2, 2),
            l1 || l2 ? (l1?.score || 0) + (l2?.score || 0) : '',
            r.fbTarget ? 'O' : '', r.fbDone.length || '', r.fbDone.reduce((t, f) => t + f.totalTries, 0) || '',
            fbLast ? `${fbLast.firstTry}/${fbLast.ids.length}` : '',
            r.fbDone.map((f) => f.ids.map((id) => `${no1(id)}:${f.tries[id]}`).join(' ')).join(' / '),
            warnBy[`${c}#${r.num}`] || 0]);
        });
      });
      if (rows.length === 1) { toast(`${d.date} ${scopeName()}에는 내려받을 기록이 없어요.`); return; }
      save(`${fileTitle}_${d.date}_${scopeName()}_학생별요약.csv`, rows);
    }

    function log() {
      const d = st.data;
      if (!d) return;
      const rows = [['날짜', '시각', '반', '번호', '종류', '회차', '점수', '맞힌 수', '틀린 문제', '다른 창 경고', '응답(문제별)']];
      d.log.filter((r) => st.scope === 'all' || r.cls === st.scope).sort((a, b) => a.submittedAt - b.submittedAt).forEach((r) => {
        const ans = ST[r.stage].items.map((p, k) => `${k + 1}:${(r.answers?.[p.id] || []).join('|')}`).join(' ');
        rows.push([d.date, fmtTime(r.submittedAt), r.cls, r.num, `${r.stage}단계`, r.attempt, r.score, `${r.correct}/${r.total}`, wrongList(r, r.stage), r.warnings || 0, ans]);
      });
      (d.fbLog || []).filter((r) => st.scope === 'all' || r.cls === st.scope).forEach((r) => {
        rows.push([d.date, fmtTime(r.finishedAt), r.cls, r.num, '피드백 문제', r.round, '', `한 번에 ${r.firstTry}/${r.ids.length}`, '', r.warnings || 0,
          r.ids.map((id) => `${no1(id)}번:${r.tries[id]}번 확인`).join(' ')]);
      });
      d.warnings.filter((w) => st.scope === 'all' || w.cls === st.scope).forEach((w) => {
        rows.push([d.date, fmtTime(w.at), w.cls, w.num, `경고(${stageName(w.stage)})`, '', '', '', '', w.label || '', '']);
      });
      if (rows.length === 1) { toast(`${d.date} ${scopeName()}에는 내려받을 기록이 없어요.`); return; }
      const body = rows.slice(1).sort((a, b) => String(a[1]).localeCompare(String(b[1])));
      save(`${fileTitle}_${d.date}_${scopeName()}_제출기록.csv`, [rows[0], ...body]);
    }
    return { summary, log };
  })();

  // ---- 진도현황: 날짜 → 그날 활동한 반 → 반의 1·2단계·피드백 문제 진도 ----
  // 지난 날짜는 그날의 제출·완료 기록으로, 오늘은 지금 푸는 중인 상태까지 함께 보여 준다.
  const progress = (() => {
    const p = { box: null, date: '', cls: '', data: null, timer: null };
    const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
    const no1 = (id) => ST[1].items.findIndex((q) => q.id === id) + 1;

    // 그날 기록으로 반별 학생 진도 만들기
    function build(d, cls) {
      const by = new Map();
      const get = (num) => {
        if (!by.has(num)) by.set(num, { num, s: { 1: [], 2: [] }, fbDone: [], fbLive: null });
        return by.get(num);
      };
      [...d.log].filter((r) => r.cls === cls).sort((a, b) => a.submittedAt - b.submittedAt)
        .forEach((r) => get(r.num).s[r.stage].push(r));
      (d.fbLog || []).filter((r) => r.cls === cls).sort((a, b) => a.finishedAt - b.finishedAt)
        .forEach((r) => get(r.num).fbDone.push(r));
      if (d.date === d.today) {
        d.students.filter((x) => x.cls === cls).forEach((x) => {
          const sp = x.stages || {};
          if (sp[1]?.active || sp[2]?.active || x.fb?.status === 'active') {
            const row = get(x.num);
            row.live = { 1: !!sp[1]?.active, 2: !!sp[2]?.active };
            if (x.fb?.status === 'active') row.fbLive = x.fb.active;
          }
        });
      }
      const rows = [...by.values()].sort((a, b) => a.num - b.num);
      rows.forEach((r) => {
        const last1 = r.s[1][r.s[1].length - 1];
        r.fbTarget = !!last1 && last1.correct <= 4;
      });
      return rows;
    }

    function summary(rows) {
      const lastScore = (n) => rows.map((r) => r.s[n][r.s[n].length - 1]).filter(Boolean).map((x) => x.score);
      const s1 = lastScore(1), s2 = lastScore(2);
      const target = rows.filter((r) => r.fbTarget).length;
      const fbDone = rows.filter((r) => r.fbDone.length).length;
      return { n: rows.length, s1: s1.length, a1: avg(s1), s2: s2.length, a2: avg(s2), target, fbDone, fbLive: rows.filter((r) => r.fbLive).length };
    }

    function stageCell(r, n) {
      const list = r.s[n];
      const live = r.live?.[n] ? '<span class="tag live">푸는 중</span> ' : '';
      if (!list.length) return live || '<span class="tag">-</span>';
      const last = list[list.length - 1];
      const tries = list.length > 1 ? ` <small>${list.length}회 (첫 ${list[0].score}점)</small>` : '';
      const wrong = ST[n].items.map((q, k) => (last.results?.[q.id]?.ok ? null : k + 1)).filter(Boolean);
      return `${live}<b class="${last.correct <= 4 && n === 1 ? 'low' : ''}">${last.score}점</b> <small>${last.correct}/${last.total}</small>${tries}
        ${wrong.length ? `<div class="wrong">틀림: ${wrong.join(', ')}</div>` : '<div class="wrong ok">모두 정답</div>'}`;
    }

    function fbCellP(r) {
      const parts = [];
      if (r.fbLive) {
        const it = r.fbLive.items;
        parts.push(`<div><span class="tag live">푸는 중 ${it.filter((x) => x.solved).length}/${it.length}</span></div>
          <div class="fbdots">${it.map((x) => `<span class="fbd${x.solved ? ' y' : x.tries ? ' n' : ''}" title="1단계 ${no1(x.id)}번 · 확인 ${x.tries}번">${no1(x.id)}${x.tries ? `<sub>${x.tries}</sub>` : ''}</span>`).join('')}</div>`);
      }
      r.fbDone.forEach((f) => {
        parts.push(`<div><span class="tag done">${f.round}회차 완료</span> <small>${fmtTime(f.finishedAt)} · 확인 ${f.totalTries}번 · 한 번에 ${f.firstTry}/${f.ids.length}</small></div>
          <div class="fbdots">${f.ids.map((id) => `<span class="fbd ${f.tries[id] === 1 ? 'y' : 'n'}" title="1단계 ${no1(id)}번 · 확인 ${f.tries[id]}번">${no1(id)}<sub>${f.tries[id]}</sub></span>`).join('')}</div>`);
      });
      if (!parts.length) return r.fbTarget ? '<span class="tag ok">대상 · 안 함</span>' : '<span class="tag">-</span>';
      return parts.join('');
    }

    function frame(title, back, body) {
      p.box.innerHTML = `<div class="wrap">
        <div class="head-row"><h1 class="title" style="font-size:28px">${title}</h1>
          <div class="head-acts">${back ? '<button class="back" id="pBack">← 뒤로</button>' : ''}<button class="back" id="pClose">관리 화면으로</button></div></div>
        ${body}</div>`;
      p.box.querySelector('#pClose').onclick = close;
      if (back) p.box.querySelector('#pBack').onclick = back;
      p.box.scrollTop = 0;
    }

    function showDates() {
      p.cls = ''; p.date = ''; stopLive();
      const dates = st.dates?.length ? st.dates : [st.data?.today].filter(Boolean);
      const today = st.data?.today;
      frame('📊 진도현황 · 날짜', null, `<div class="note">날짜를 누르면 그날 활동한 반이 나와요.</div>
        <div class="pick-grid">${dates.map((x) => `<button class="pick" data-date="${x}">${x}${x === today ? '<small>오늘</small>' : ''}</button>`).join('')}</div>`);
      p.box.querySelectorAll('[data-date]').forEach((b) => { b.onclick = () => showClasses(b.dataset.date); });
    }

    async function load(date) {
      p.data = await call('GET', null, false, date);
      return p.data;
    }

    async function showClasses(date) {
      p.date = date; p.cls = ''; stopLive();
      frame(`📊 ${date} · 반 고르기`, showDates, '<div class="empty">불러오는 중…</div>');
      let d;
      try { d = await load(date); } catch (e) { frame(`📊 ${date}`, showDates, `<div class="err">${esc(e.message)}</div>`); return; }
      if (p.date !== date || p.cls) return;
      const cards = CLASSES.map((c) => {
        const sm = summary(build(d, c));
        return `<button class="pick cls${sm.n ? '' : ' empty-cls'}" data-cls="${c}"><b>${c}반</b>
          ${sm.n ? `<span>1단계 ${sm.s1}명 · 평균 ${sm.a1}점</span><span>2단계 ${sm.s2}명 · 평균 ${sm.a2}점</span>
          <span>피드백 대상 ${sm.target}명 · 완료 ${sm.fbDone}명${sm.fbLive ? ` · 푸는 중 ${sm.fbLive}명` : ''}</span>` : '<span>이날 기록 없음</span>'}</button>`;
      }).join('');
      frame(`📊 ${date} · 반 고르기`, showDates, `<div class="note">반을 누르면 학생별 단계 진도와 피드백 문제 진도가 나와요.</div><div class="pick-grid cls-grid">${cards}</div>`);
      p.box.querySelectorAll('[data-cls]').forEach((b) => { b.onclick = () => showClass(date, b.dataset.cls); });
    }

    function paintClass() {
      const d = p.data;
      const rows = build(d, p.cls);
      const sm = summary(rows);
      const isToday = d.date === d.today;
      frame(`📊 ${p.date} · ${p.cls}반 진도`, () => showClasses(p.date), `
        <div class="tiles">
          <div class="tile"><div>1단계</div><b>${sm.s1}</b>명 · 평균 <b>${sm.a1}</b>점</div>
          <div class="tile"><div>2단계</div><b>${sm.s2}</b>명 · 평균 <b>${sm.a2}</b>점</div>
          <div class="tile"><div>피드백 문제 (대상 = 1단계 4개 이하)</div><b>${sm.fbDone}</b> / ${sm.target}명 완료${sm.fbLive ? ` · 푸는 중 ${sm.fbLive}` : ''}</div>
        </div>
        <div class="panel"><h2>학생별 진도 ${isToday ? '<small class="live-note">5초마다 갱신</small>' : ''}</h2>
          <div class="note">점수는 그날 마지막 제출이에요. 1단계 4개 이하는 주황색이고 피드백 문제 대상이에요. 피드백 칸의 작은 네모는 1단계 문제 번호이고, 아래 숫자는 맞히기까지 확인한 횟수예요(초록 = 한 번에 정답).</div>
          <div class="scroll"><table class="ptable"><thead><tr><th>번호</th><th>1단계</th><th>2단계</th><th>피드백 문제</th></tr></thead>
          <tbody>${rows.map((r) => `<tr${r.fbTarget ? ' class="target"' : ''}><td><b>${r.num}</b></td><td class="left">${stageCell(r, 1)}</td><td class="left">${stageCell(r, 2)}</td><td class="left">${fbCellP(r)}</td></tr>`).join('') || '<tr><td colspan="4">이날 이 반의 기록이 없습니다.</td></tr>'}</tbody></table></div>
        </div>`);
    }

    async function showClass(date, cls) {
      p.date = date; p.cls = cls;
      paintClass();
      stopLive();
      if (p.data.date === p.data.today) {
        p.timer = setInterval(async () => {
          if (document.hidden || p.cls !== cls || p.date !== date) return;
          try { await load(date); if (p.cls === cls && p.date === date) { const y = p.box.scrollTop; paintClass(); p.box.scrollTop = y; } } catch (e) { /* 다음 갱신에 다시 */ }
        }, POLL_MS);
      }
    }

    function stopLive() { if (p.timer) { clearInterval(p.timer); p.timer = null; } }

    function close() {
      stopLive();
      p.box?.remove();
      p.box = null;
    }

    return {
      build, stageCell, fbCell: fbCellP,
      open() {
        if (!p.box) {
          p.box = document.createElement('div');
          p.box.className = 'progress-screen';
          document.body.appendChild(p.box);
        }
        showDates();
      },
    };
  })();

  st.pw = savedPw();
  if (st.pw) start(); else showLogin();
})();
