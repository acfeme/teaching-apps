// 수업 자료 잠금: 선생님이 관리자 화면에서 그 반에 열어 준 자료만 보인다.
// 자료 화면 <head> 맨 앞에서 <script src="/engine/gate.js" data-mat="자료 id"> 로 불러온다.
// 관리자 화면에서 로그인한 탭(같은 탭)에서는 반과 상관없이 열린다.
(function () {
  var script = document.currentScript;
  var id = script && script.getAttribute('data-mat');
  if (!id) return;
  // 자료 목록 화면 안의 iframe(같은 사이트)은 바깥 화면이 이미 확인했다
  try { if (window.top !== window && window.top.location.host === location.host) return; } catch (e) { /* 다른 사이트 안 */ }
  // /m/lesson → /m/lesson/ (상대 주소의 화면 파일을 찾을 수 있게)
  if (/^\/m\/[a-z0-9-]+$/.test(location.pathname)) { location.replace(location.pathname + '/' + location.search); return; }
  var isGame = id === 'games';

  var CLASSES = ['2-1', '2-2', '2-3', '2-4', '2-A', '2-B', '2-C']; // 2-A·2-B·2-C = 외부 체험용 샘플반
  var CHECK_MS = 15000;
  var root = document.documentElement;
  var ssGet = function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
  var ssSet = function (k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* 저장 불가 */ } };

  var style = document.createElement('style');
  style.textContent = 'html.mat-locked body > *:not(#mat-gate){visibility:hidden !important}'
    + '#mat-gate{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;'
    + 'background:#f4f7fb;font-family:"Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#1c2230}'
    + '#mat-gate .box{max-width:440px;width:100%;background:#fff;border-radius:18px;box-shadow:0 8px 30px rgba(20,40,80,.12);padding:28px 24px;text-align:center}'
    + '#mat-gate h1{font-size:22px;margin:8px 0 6px}#mat-gate p{margin:6px 0 16px;color:#4b5568;line-height:1.55;font-size:16px}'
    + '#mat-gate .ico{font-size:44px}#mat-gate .cls{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:8px 0 14px}'
    + '#mat-gate button{font:inherit;font-size:17px;padding:12px;border-radius:12px;border:2px solid #c9d3e3;background:#fff;cursor:pointer}'
    + '#mat-gate button.go{background:#2f6fde;border-color:#2f6fde;color:#fff}#mat-gate a{color:#2f6fde;font-size:15px}'
    + '#mat-gate .small{font-size:14px;color:#6b7588;margin-top:12px}';
  root.appendChild(style);
  root.classList.add('mat-locked');

  var me = null;
  try { me = JSON.parse(ssGet('tp-me') || 'null'); } catch (e) { me = null; }
  var q = new URLSearchParams(location.search).get('c');
  var cls = CLASSES.indexOf(q) >= 0 ? q : (me && CLASSES.indexOf(me.cls) >= 0 ? me.cls : ssGet('mat-cls'));
  if (CLASSES.indexOf(cls) < 0) cls = null;
  if (cls) ssSet('mat-cls', cls);
  var pw = ssGet('tp-admin');
  var timer = null;

  function gate() {
    var el = document.getElementById('mat-gate');
    if (!el) { el = document.createElement('div'); el.id = 'mat-gate'; document.body.appendChild(el); }
    return el;
  }
  function whenBody(fn) { if (document.body) fn(); else document.addEventListener('DOMContentLoaded', fn); }

  function unlock() {
    root.classList.remove('mat-locked');
    var el = document.getElementById('mat-gate');
    if (el) el.remove();
  }
  function show(html) {
    root.classList.add('mat-locked');
    whenBody(function () {
      var el = gate();
      el.innerHTML = '<div class="box">' + html + '<div class="small"><a href="/">← 닮음 탐구 교실로 가기</a></div></div>';
      el.querySelectorAll('[data-cls]').forEach(function (b) {
        b.onclick = function () { cls = b.getAttribute('data-cls'); ssSet('mat-cls', cls); check(); };
      });
      var other = el.querySelector('[data-change]');
      if (other) other.onclick = function () { cls = null; ssSet('mat-cls', null); askClass(); };
      var retry = el.querySelector('[data-retry]');
      if (retry) retry.onclick = check;
    });
  }
  function askClass() {
    show('<div class="ico">🏫</div><h1>몇 반인가요?</h1><p>' + (isGame ? '우리 반 게임이 열려 있는지 확인할게요.' : '선생님이 우리 반에 열어 준 자료만 볼 수 있어요.') + '</p><div class="cls">'
      + CLASSES.map(function (c) { return '<button data-cls="' + c + '">' + c + '반</button>'; }).join('') + '</div>');
  }

  function check() {
    if (!cls && !pw) {
      if (!isGame) { askClass(); return; }
      // 게임: 반을 모를 때는 모든 반이 열려 있으면 그냥 열고, 한 반이라도 잠겼으면 반을 묻는다
      fetch('/api/material', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
        var st = (d && d.open && d.open.games) || {};
        if (CLASSES.every(function (c) { return st[c]; })) unlock(); else askClass();
      }).catch(function () { unlock(); });
      return;
    }
    var headers = pw ? { 'x-admin-password': pw } : {};
    var url = '/api/material?id=' + encodeURIComponent(id) + '&cls=' + encodeURIComponent(cls || CLASSES[0]);
    fetch(url, { cache: 'no-store', headers: headers })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (x) {
        if (x.ok && x.d.open) { unlock(); return; }
        if (x.ok && !cls) { pw = null; askClass(); return; } // 관리자 비밀번호가 바뀐 탭
        if (!x.ok) throw new Error(x.d.error || '');
        show(isGame
          ? '<div class="ico">🎮🔒</div><h1>지금은 게임이 잠겨 있어요</h1><p><b>' + cls + '반</b>은 선생님이 게임을 잠갔어요.<br>문제풀이를 먼저 하고 오세요! 게임이 열리면 저절로 보여요.</p><button data-change>다른 반이에요</button>'
          : '<div class="ico">🔒</div><h1>아직 열리지 않았어요</h1><p><b>' + cls + '반</b>에는 선생님이 아직 이 자료를 열지 않았어요.<br>선생님이 열어 주시면 저절로 보여요.</p>'
          + '<button data-change>다른 반이에요</button>');
      })
      .catch(function () {
        show('<div class="ico">📶</div><h1>확인하지 못했어요</h1><p>인터넷 연결을 확인하고 다시 눌러 주세요.</p><button class="go" data-retry>다시 확인</button>');
      });
  }

  check();
  timer = setInterval(function () { if (!document.hidden && (cls || pw || isGame)) check(); }, CHECK_MS);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && (cls || pw || isGame)) check(); });
})();
