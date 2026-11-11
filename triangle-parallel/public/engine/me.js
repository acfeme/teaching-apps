// 학생 로그인(모든 화면이 함께 쓴다): 반·번호를 고르고 숫자 4자리 비밀번호를 넣는다.
// 처음 들어오는 학생은 비밀번호를 정하고, 서버가 랜덤 별명을 정해 준다. 랭킹에는 번호 대신 별명만 보인다.
// 로그인 정보는 이 브라우저 탭에만 남는다(sessionStorage 'tp-me', 탭을 닫으면 다시 비밀번호).
//   ME.get()                 → {cls, num, nick, token} 또는 null
//   ME.login(안내 글)         → 반·번호·비밀번호를 물어 로그인 (취소하면 null)
//   ME.pin(cls, num, 안내 글) → 반·번호를 이미 골랐을 때 비밀번호만 묻기
//   ME.logout()
//   ME.headers()             → 서버 요청에 붙일 {'x-student-token': ...}
window.ME = (function () {
  const CLASSES = ['2-1', '2-2', '2-3', '2-4', '2-A', '2-B', '2-C']; // 2-A·2-B·2-C = 외부 체험용 샘플반
  const MAX_NUMBER = 35;
  const KEY = 'tp-me';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const css = document.createElement('style');
  css.textContent = `
  .me-screen{position:fixed;inset:0;z-index:200;background:rgba(20,30,40,.55);display:flex;justify-content:center;align-items:flex-start;overflow-y:auto;padding:24px 14px;font-family:"Pretendard","Noto Sans KR","Malgun Gothic",sans-serif;color:#1c2230;line-height:1.45}
  .me-box{width:100%;max-width:520px;background:#fff8ec;border-radius:22px;padding:20px;box-shadow:0 12px 40px rgba(0,0,0,.25);text-align:center}
  .me-box h2{margin:0 0 6px;font-size:25px;word-break:keep-all}
  .me-box p{margin:0 0 12px;color:#5a6474;font-size:17px;word-break:keep-all}
  .me-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
  .me-nums{display:grid;grid-template-columns:repeat(auto-fill,minmax(60px,1fr));gap:8px}
  .me-grid button,.me-nums button,.me-pad button{min-height:58px;border-radius:14px;border:2px solid #ead9bd;background:#fff;font:inherit;font-weight:800;font-size:22px;cursor:pointer;color:#1c2230}
  .me-dots{display:flex;justify-content:center;gap:14px;margin:6px 0 14px}
  .me-dots i{width:22px;height:22px;border-radius:50%;border:3px solid #a85e05;display:block}
  .me-dots i.on{background:#e08a1e;border-color:#e08a1e}
  .me-pad{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;max-width:320px;margin:0 auto}
  .me-pad button{min-height:64px;font-size:26px}
  .me-pad .sm{font-size:17px}
  .me-msg{min-height:26px;color:#c24a2b;font-weight:800;margin:4px 0 8px;word-break:keep-all}
  .me-msg.ok{color:#17835f}
  .me-row{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:14px}
  .me-link{background:none;border:0;color:#a85e05;font:inherit;font-weight:800;font-size:16px;text-decoration:underline;cursor:pointer;padding:8px}
  .me-nick{display:inline-block;margin:8px 0 12px;padding:10px 18px;border-radius:16px;background:#fff;border:3px solid #e08a1e;font-size:28px;font-weight:900;color:#a85e05}
  .me-go{min-height:60px;padding:0 28px;border-radius:16px;border:0;background:#e08a1e;color:#fff;font:inherit;font-weight:900;font-size:21px;cursor:pointer;box-shadow:0 5px 0 #a85e05}
  .me-who{font-weight:900;color:#a85e05}`;
  document.head.appendChild(css);

  const ss = {
    get: () => { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { return null; } },
    set: (v) => { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* 저장 불가 */ } },
    del: () => { try { sessionStorage.removeItem(KEY); } catch (e) { /* 저장 불가 */ } },
  };
  function get() {
    const m = ss.get();
    if (!m || !m.token || !CLASSES.includes(m.cls) || !(m.num >= 1 && m.num <= MAX_NUMBER)) return null;
    if (m.exp && Date.now() > m.exp) { ss.del(); return null; }
    return m;
  }
  const headers = () => { const m = get(); return m ? { 'x-student-token': m.token } : {}; };
  function logout() { ss.del(); }

  async function post(body) {
    let r;
    try { r = await fetch('/api/auth', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); } catch (e) {
      throw new Error('인터넷 연결을 확인하고 다시 눌러 주세요.');
    }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || '잠시 후 다시 시도해 주세요.'); e.code = d.code; throw e; }
    return d;
  }

  let screen = null;
  function frame(html) {
    if (!screen) { screen = document.createElement('div'); screen.className = 'me-screen'; document.body.appendChild(screen); }
    screen.innerHTML = `<div class="me-box">${html}</div>`;
  }
  function closeScreen() { screen?.remove(); screen = null; }

  // 숫자 4자리 입력판
  function pad(onDone, title, sub, extra) {
    let v = '';
    frame(`<h2>${title}</h2><p>${sub}</p><div class="me-dots">${'<i></i>'.repeat(4)}</div><div class="me-msg" id="meMsg"></div>
      <div class="me-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-k="${n}">${n}</button>`).join('')}<button class="sm" data-k="c">지우기</button><button data-k="0">0</button><button class="sm" data-k="b">⌫</button></div>
      <div class="me-row">${extra || ''}</div>`);
    const paint = () => screen.querySelectorAll('.me-dots i').forEach((d, i) => d.classList.toggle('on', i < v.length));
    const msg = (t, ok) => { const m = screen.querySelector('#meMsg'); m.textContent = t || ''; m.className = `me-msg${ok ? ' ok' : ''}`; };
    let busy = false;
    const press = async (k) => {
      if (busy) return;
      if (k === 'c') v = '';
      else if (k === 'b') v = v.slice(0, -1);
      else if (v.length < 4) v += k;
      paint();
      if (v.length === 4) {
        busy = true;
        const r = await onDone(v, msg);
        busy = false;
        if (r === 'clear') { v = ''; paint(); }
      }
    };
    screen.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => press(b.dataset.k); });
    const onKey = (e) => { if (!screen) { document.removeEventListener('keydown', onKey); return; } if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('b'); };
    document.addEventListener('keydown', onKey);
    return { msg };
  }

  // 반·번호를 이미 골랐을 때 비밀번호만 묻는다
  function pin(cls, num, reason) {
    return new Promise((resolve) => {
      const cancel = () => { closeScreen(); resolve(null); };
      const notMe = '<button class="me-link" data-cancel>← 내 번호가 아니에요</button><span></span>';
      const done = (d) => {
        const m = { cls, num, nick: d.nick, token: d.token, exp: Date.now() + 11.5 * 3600e3 };
        ss.set(m);
        if (!d.created) { closeScreen(); resolve(m); return; }
        frame(`<h2>🎉 반가워요!</h2><p>게임과 순위에는 번호 대신 <b>별명</b>만 보여요.<br>친구들은 누구인지 몰라요. 나만 알고 있어요!</p>
          <div class="me-nick">${esc(d.nick)}</div><p>비밀번호는 꼭 기억해 두세요. 잊어버리면 선생님께 초기화를 부탁해요.</p>
          <button class="me-go" data-ok>시작하기 ▶</button>`);
        screen.querySelector('[data-ok]').onclick = () => { closeScreen(); resolve(m); };
      };
      const ask = async () => {
        frame('<p>확인 중…</p>');
        let st;
        try { st = await post({ action: 'check', cls, num }); } catch (e) {
          frame(`<h2>🔒 들어갈 수 없어요</h2><p>${esc(e.message)}</p><div class="me-row">${notMe}</div>`);
          screen.querySelector('[data-cancel]').onclick = cancel;
          return;
        }
        const who = `<span class="me-who">${esc(cls)}반 ${num}번</span>`;
        if (st.hasPin) {
          pad(async (v, msg) => {
            try { done(await post({ action: 'login', cls, num, pin: v })); return 'ok'; } catch (e) { msg(e.message); return 'clear'; }
          }, '🔑 비밀번호', `${who} · ${esc(reason || '내 비밀번호 숫자 4자리를 눌러요.')}`, notMe);
        } else {
          pad(async (first) => {
            pad(async (second, msg) => {
              if (second !== first) { msg('처음 누른 것과 달라요. 다시 정해요.'); setTimeout(ask, 1100); return 'ok'; }
              try { done(await post({ action: 'login', cls, num, pin: second })); return 'ok'; } catch (e) { msg(e.message); return 'clear'; }
            }, '🔁 한 번 더', `${who} · 방금 정한 비밀번호를 한 번 더 눌러요.`, notMe);
            return 'ok';
          }, '✨ 처음 왔어요!', `${who} · 나만 아는 비밀번호 <b>숫자 4자리</b>를 정해요. 다음부터 이 번호로 들어와요.`, notMe);
        }
        screen.querySelector('[data-cancel]')?.addEventListener('click', cancel);
      };
      // pad()가 화면을 다시 그릴 때마다 '내 번호가 아니에요'를 연결한다
      const obs = new MutationObserver(() => { screen?.querySelector('[data-cancel]')?.addEventListener('click', cancel); });
      ask().then(() => { if (screen) obs.observe(screen, { childList: true }); });
    });
  }

  // 반 → 번호 → 비밀번호
  function login(reason) {
    return new Promise((resolve) => {
      const cancelRow = '<div class="me-row"><button class="me-link" data-cancel>닫기</button><span></span></div>';
      const pickClass = () => {
        frame(`<h2>🏫 누구인가요?</h2><p>${esc(reason || '반과 번호를 고르고 비밀번호를 넣어요.')}</p><div class="me-grid">${CLASSES.map((c) => `<button data-c="${c}">${c}반</button>`).join('')}</div>${cancelRow}`);
        screen.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => pickNum(b.dataset.c); });
        screen.querySelector('[data-cancel]').onclick = () => { closeScreen(); resolve(null); };
      };
      const pickNum = (cls) => {
        frame(`<h2>${cls}반 · 내 번호</h2><div class="me-nums">${Array.from({ length: MAX_NUMBER }, (_, i) => `<button data-n="${i + 1}">${i + 1}</button>`).join('')}</div>
          <div class="me-row"><button class="me-link" data-back>← 반 다시 고르기</button><button class="me-link" data-cancel>닫기</button></div>`);
        screen.querySelectorAll('[data-n]').forEach((b) => {
          b.onclick = async () => { const m = await pin(cls, Number(b.dataset.n)); if (m) resolve(m); else pickClass(); };
        });
        screen.querySelector('[data-back]').onclick = pickClass;
        screen.querySelector('[data-cancel]').onclick = () => { closeScreen(); resolve(null); };
      };
      pickClass();
    });
  }

  return { get, login, pin, logout, headers, CLASSES, MAX_NUMBER };
})();
