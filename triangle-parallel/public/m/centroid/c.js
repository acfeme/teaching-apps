// 삼각형의 무게중심 수업 화면 공통 도구: SVG 그리기, 점 끌기(손가락·마우스), 기하 계산, 축하 효과, 효과음
window.C = (function () {
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (s) => document.querySelector(s);
  // SVG 요소 만들기: S('circle', {cx, cy, r}, 부모)
  function S(tag, attrs, parent) {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs || {}) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }
  const f = (v) => Math.round(v * 10) / 10;
  const P = (p) => `${f(p[0])},${f(p[1])}`;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const cen = (a, b, c) => [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
  const area = (a, b, c) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
  // 두 직선(a1-a2, b1-b2)의 교점
  function cross(a1, a2, b1, b2) {
    const d = (a2[0] - a1[0]) * (b2[1] - b1[1]) - (a2[1] - a1[1]) * (b2[0] - b1[0]);
    if (Math.abs(d) < 1e-9) return null;
    const t = ((b1[0] - a1[0]) * (b2[1] - b1[1]) - (b1[1] - a1[1]) * (b2[0] - b1[0])) / d;
    return lerp(a1, a2, t);
  }
  // 화면 좌표 → SVG 좌표
  function toSvg(svg, e) {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM().inverse());
    return [q.x, q.y];
  }
  // 점 끌기: el을 누르고 끌면 onMove([x, y]) — 손가락·펜·마우스 모두
  function draggable(svg, el, onMove, onEnd) {
    el.classList.add('drag');
    // 끄는 동안 화면을 다시 그려도(점이 새로 만들어져도) 계속 끌리도록 창 전체에서 움직임을 듣는다
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const mv = (ev) => { ev.preventDefault(); onMove(toSvg(svg, ev)); };
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); if (onEnd) onEnd(); };
      window.addEventListener('pointermove', mv, { passive: false }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    });
  }
  const clamp = (p, x0, y0, x1, y1) => [Math.max(x0, Math.min(x1, p[0])), Math.max(y0, Math.min(y1, p[1]))];
  // 축하 색종이
  function confetti(svg, x, y) {
    const cols = ['#FF6B6B', '#FFD93D', '#2DBE9E', '#6FB7FF', '#9B6BFF', '#FF8FC7'];
    for (let i = 0; i < 26; i++) {
      const r = S('rect', { x: x + (Math.random() - 0.5) * 500, y: y - 80 + Math.random() * 60, width: 14, height: 14, rx: i % 2 ? 7 : 2, fill: cols[i % cols.length], class: 'conf', style: `animation-delay:${(Math.random() * 0.5).toFixed(2)}s` }, svg);
      setTimeout(() => r.remove(), 2400);
    }
  }
  // 아주 작은 효과음(브라우저가 허용할 때만)
  let ac = null;
  function tone(freq, dur, type, vol, delay) {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const t = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* 소리 없이 */ }
  }
  const sfx = {
    good: () => { tone(660, 0.12); tone(880, 0.18, 'sine', 0.12, 0.1); },
    bad: () => { tone(220, 0.2, 'triangle', 0.1); },
    pop: () => tone(990, 0.08, 'triangle', 0.1),
    win: () => [523, 659, 784, 1047].forEach((n, i) => tone(n, 0.22, 'sine', 0.12, i * 0.11)),
  };
  // 삼각형 꼭짓점 이름 붙이기(무게중심에서 바깥쪽으로)
  function label(svg, p, from, t, opt) {
    const d = dist(p, from) || 1, o = (opt && opt.d) || 30;
    const el = S('text', { x: f(p[0] + ((p[0] - from[0]) / d) * o), y: f(p[1] + ((p[1] - from[1]) / d) * o), 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': (opt && opt.size) || 40, fill: (opt && opt.fill) || '#2A2140' }, svg);
    el.textContent = t;
    return el;
  }
  return { $, S, f, P, mid, lerp, dist, cen, area, cross, toSvg, draggable, clamp, confetti, sfx, label };
})();
