// 무게중심 스피드 퀴즈 문제 은행(⑧ 모둠 스피드 퀴즈와 게임 '무게중심 스피드 퀴즈'가 함께 쓴다). c.js 다음에 불러온다.
// CQ.setOf(유형 0~7) → 그 유형의 8문제(칸 0~7: 초성·OX·2:1·2:1·넓이·넓이·2:1·도전), CQ.fig(문제.f, 유형) → 그림 svg
window.CQ = (function () {
const { S, P, mid, cen } = C;
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const TYPES = 'ABCDEFGH'.split('');
// 유형마다 다른 삼각형 모양(그림 칸 520×340)
const TRI = [
  [[250, 34], [42, 306], [480, 296]], [[176, 34], [48, 300], [472, 308]], [[338, 34], [40, 298], [482, 290]], [[128, 40], [58, 306], [470, 282]],
  [[396, 40], [46, 290], [462, 308]], [[262, 30], [92, 308], [482, 298]], [[212, 36], [40, 292], [432, 308]], [[306, 30], [58, 308], [446, 300]],
];
// ---------- 문제 은행: 8칸(문제 종류) × 8유형(A~H). 같은 칸은 종류·난이도가 같고 내용은 모두 다르다 ----------
const WORDS = [
  { w: '중선', c: 'ㅈㅅ', q: '꼭짓점과 마주 보는 변의 중점을 이은 선분', f: 'median' },
  { w: '무게중심', c: 'ㅁㄱㅈㅅ', q: '삼각형의 세 중선이 만나는 점', f: 'centroid' },
  { w: '중점', c: 'ㅈㅈ', q: '선분을 똑같이 둘로 나누는 점', f: 'mid' },
  { w: '교점', c: 'ㄱㅈ', q: '두 선이 만나는 점', f: 'inter' },
  { w: '꼭짓점', c: 'ㄲㅈㅈ', q: '삼각형의 뾰족한 세 점', f: 'vert' },
  { w: '대변', c: 'ㄷㅂ', q: '꼭짓점 A와 마주 보는 변 BC를 A의 ○○이라 해요', f: 'side' },
  { w: '중력', c: 'ㅈㄹ', q: '무게중심 기호 G는 Gravity, 우리말로?', f: 'gravity' },
  { w: '균형', c: 'ㄱㅎ', q: '무게중심을 받치면 물체가 ○○을 잡아요', f: 'balance' },
];
const FAKE = ['중앙', '직선', '접점', '각도', '수선', '높이', '넓이', '중심'];
const ov = (s) => `<span class="ov">${s}</span>`; // 선분 기호(윗줄)
const OX = [
  ['무게중심은 세 중선의 교점이다.', 'O'], ['한 삼각형에는 중선이 2개 있다.', 'X'], ['무게중심은 중선을 꼭짓점으로부터 1 : 2로 나눈다.', 'X'], ['세 중선으로 나뉜 6개 삼각형의 넓이는 모두 같다.', 'O'],
  ['무게중심은 삼각형의 바깥에 있을 수도 있다.', 'X'], [`무게중심 G에서 ${ov('AG')}는 ${ov('GD')}의 2배이다.`, 'O'], ['△GAB의 넓이는 △ABC의 1/2이다.', 'X'], [`중선 ${ov('AD')}는 △ABC의 넓이를 이등분한다.`, 'O'],
];
const N3 = [9, 12, 15, 18, 21, 24, 27, 30];      // 중선 AD → AG
const N4 = [4, 3, 5, 6, 7, 2, 8, 9];              // GD → AD
const N5 = [18, 24, 30, 36, 42, 48, 54, 60];      // △ABC → 한 조각
const N6 = [5, 7, 4, 8, 6, 9, 10, 11];            // △GAB → △ABC
const N7 = [8, 6, 10, 12, 14, 16, 18, 4];         // BG → GE
const N8 = [2, 1, 3, 4, 5, 6, 7, 8];              // AD = 9q, G'은 △GBC의 무게중심 → GG'
const opts = (ans, cands) => { const o = [ans]; for (const c of cands) if (o.length < 4 && c > 0 && Number.isInteger(c) && !o.includes(c)) o.push(c); let k = 1; while (o.length < 4) { if (!o.includes(ans + k)) o.push(ans + k); k++; } return shuffle(o.map(String)); };
function setOf(ti) {
  const i = ti, W = WORDS[i];
  const others = shuffle([...WORDS.filter((x) => x !== W).map((x) => x.w), ...FAKE]).slice(0, 3);
  const n3 = N3[i], n4 = N4[i], n5 = N5[i], n6 = N6[i], n7 = N7[i], q8 = N8[i];
  return [
    { k: '🔤 초성 퀴즈', cho: W.c, t: W.q, a: W.w, o: shuffle([W.w, ...others]), f: { kind: W.f } },
    { k: '⭕❌ OX', t: OX[i][0], a: OX[i][1], o: ['O', 'X'], f: { kind: 'centroid' } },
    { k: '📏 2 : 1', t: `G는 무게중심, 중선 ${ov('AD')} = ${n3} 일 때 ${ov('AG')} = ?`, a: String((2 * n3) / 3), o: opts((2 * n3) / 3, [n3 / 3, n3 / 2, n3, n3 * 2]), f: { kind: 'q3', v: n3 } },
    { k: '📏 2 : 1', t: `G는 무게중심, ${ov('GD')} = ${n4} 일 때 중선 ${ov('AD')} = ?`, a: String(3 * n4), o: opts(3 * n4, [2 * n4, 4 * n4, n4 + 3, 6 * n4]), f: { kind: 'q4', v: n4 } },
    { k: '🍕 넓이', t: `△ABC = ${n5} 일 때 색칠한 삼각형의 넓이는?`, a: String(n5 / 6), o: opts(n5 / 6, [n5 / 3, n5 / 2, n5 / 6 + 2, n5 / 12]), f: { kind: 'q5', v: n5 } },
    { k: '🍕 넓이', t: `색칠한 △GAB = ${n6} 일 때 △ABC의 넓이는?`, a: String(3 * n6), o: opts(3 * n6, [6 * n6, 2 * n6, 4 * n6, n6 + 6]), f: { kind: 'q6', v: n6 } },
    { k: '📏 2 : 1', t: `G는 무게중심, ${ov('BG')} = ${n7} 일 때 ${ov('GE')} = ?`, a: String(n7 / 2), o: opts(n7 / 2, [n7, 2 * n7, n7 / 2 + 1, (3 * n7) / 2]), f: { kind: 'q7', v: n7 } },
    { k: '🧠 도전', t: `G는 △ABC의, G'은 △GBC의 무게중심. ${ov('AD')} = ${9 * q8} 일 때 ${ov("GG'")} = ?`, a: String(2 * q8), o: opts(2 * q8, [3 * q8, q8, 6 * q8, 4 * q8]), f: { kind: 'q8', v: 9 * q8 } },
  ];
}
// ---------- 문제 그림 ----------
function fig(f, ti) {
  const [A, B, Cc] = TRI[ti];
  const svg = S('svg', { viewBox: '0 0 520 340' });
  const G = cen(A, B, Cc), D = mid(B, Cc), E = mid(Cc, A), F = mid(A, B);
  const line = (p, q, col, w, dash) => S('line', { x1: p[0], y1: p[1], x2: q[0], y2: q[1], stroke: col || '#2A2140', 'stroke-width': w || 4, 'stroke-linecap': 'round', 'stroke-dasharray': dash || null }, svg);
  const txt = (p, t, col, size) => { const el = S('text', { x: p[0], y: p[1], 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': size || 26, fill: col || '#2A2140', stroke: '#FFFDF5', 'stroke-width': 6, 'paint-order': 'stroke' }, svg); el.textContent = t; return el; };
  const dot = (p, col, r) => S('circle', { cx: p[0], cy: p[1], r: r || 7, fill: col || '#2A2140' }, svg);
  const out = (p, t, d) => { const u = [p[0] - G[0], p[1] - G[1]], L = Math.hypot(u[0], u[1]) || 1; txt([p[0] + (u[0] / L) * (d || 22), p[1] + (u[1] / L) * (d || 22)], t, '#2A2140', 28); };
  const poly = (pts, fill, op) => S('polygon', { points: pts.map(P).join(' '), fill, opacity: op || 1, stroke: '#2A2140', 'stroke-width': 3, 'stroke-linejoin': 'round' }, svg);
  const tick = (p, q, n) => { const m = mid(p, q), L = Math.hypot(q[0] - p[0], q[1] - p[1]), nx = -(q[1] - p[1]) / L, ny = (q[0] - p[0]) / L; for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * 7, ux = (q[0] - p[0]) / L, uy = (q[1] - p[1]) / L; line([m[0] + ux * o - nx * 10, m[1] + uy * o - ny * 10], [m[0] + ux * o + nx * 10, m[1] + uy * o + ny * 10], '#2A2140', 3); } };
  const along = (p, q, t, col, side) => { const m = mid(p, q), L = Math.hypot(q[0] - p[0], q[1] - p[1]), nx = -(q[1] - p[1]) / L, ny = (q[0] - p[0]) / L; const s = side || 1; txt([m[0] + nx * 26 * s, m[1] + ny * 26 * s], t, col, 28); };
  poly([A, B, Cc], '#FFE7A8');
  const k = f.kind;
  const medians = () => { line(A, D, '#FF6B6B', 4); line(B, E, '#2DBE9E', 4); line(Cc, F, '#9B6BFF', 4); };
  if (k === 'median') { line(A, D, '#FF6B6B', 8); tick(B, D, 1); tick(D, Cc, 1); dot(D, '#FF6B6B'); out(D, 'D'); }
  if (k === 'centroid') { medians(); dot(G, '#FF6B6B', 10); txt([G[0] + 22, G[1] - 18], 'G', '#FF6B6B', 30); }
  if (k === 'mid') { line(B, Cc, '#6FB7FF', 8); tick(B, D, 1); tick(D, Cc, 1); dot(D, '#FF6B6B', 10); out(D, 'M'); }
  if (k === 'inter') { line(A, D, '#FF6B6B', 5); line(B, E, '#2DBE9E', 5); S('circle', { cx: G[0], cy: G[1], r: 18, fill: 'none', stroke: '#FF6B6B', 'stroke-width': 5 }, svg); txt([G[0] + 30, G[1] - 22], '?', '#FF6B6B', 34); }
  if (k === 'vert') { [A, B, Cc].forEach((p) => S('circle', { cx: p[0], cy: p[1], r: 14, fill: '#FF6B6B', stroke: '#2A2140', 'stroke-width': 3 }, svg)); }
  if (k === 'side') { line(B, Cc, '#FF6B6B', 9); S('circle', { cx: A[0], cy: A[1], r: 12, fill: '#2DBE9E' }, svg); }
  if (k === 'gravity') { medians(); dot(G, '#FF6B6B', 10); line(G, [G[0], G[1] + 80], '#FF6B6B', 5); S('polygon', { points: `${G[0] - 12},${G[1] + 72} ${G[0] + 12},${G[1] + 72} ${G[0]},${G[1] + 94}`, fill: '#FF6B6B' }, svg); txt([G[0] + 22, G[1] - 18], 'G', '#FF6B6B', 30); }
  if (k === 'balance') { dot(G, '#FF6B6B', 10); S('rect', { x: G[0] - 9, y: G[1] + 8, width: 18, height: 120, fill: '#FFD93D', stroke: '#2A2140', 'stroke-width': 3 }, svg); S('polygon', { points: `${G[0] - 9},${G[1] + 8} ${G[0] + 9},${G[1] + 8} ${G[0]},${G[1] - 4}`, fill: '#F6C27A', stroke: '#2A2140', 'stroke-width': 2 }, svg); }
  if (k === 'q3' || k === 'q4') {
    line(A, G, '#FF6B6B', 7); line(G, D, '#6FB7FF', 7); tick(B, D, 1); tick(D, Cc, 1); dot(D); dot(G, '#2A2140', 8);
    txt([G[0] + 24, G[1] - 16], 'G'); out(D, 'D');
    const s = (G[0] < A[0]) ? 1 : -1;
    // 길이는 문제 글에 있으니 그림에는 구할 곳(?)과 주어진 짧은 길이만
    if (k === 'q3') { along(A, G, '?', '#FF6B6B', s); along(G, D, '', '#2F6FE0', s); }
    else { along(G, D, String(f.v), '#2F6FE0', s); }
  }
  if (k === 'q5') { poly([B, D, G], '#FF9AA2'); medians(); dot(G); txt([G[0] + 22, G[1] - 18], 'G'); out(D, 'D'); }
  if (k === 'q6') { poly([G, A, B], '#A8D8FF'); line(Cc, F, '#9B6BFF', 3, '8 6'); line(A, D, '#2A2140', 3, '8 6'); line(B, E, '#2A2140', 3, '8 6'); dot(G); txt([G[0] + 22, G[1] - 18], 'G'); const c = cen(G, A, B); txt(c, String(f.v), '#2F6FE0', 34); }
  if (k === 'q7') { line(B, G, '#FF6B6B', 7); line(G, E, '#6FB7FF', 7); tick(Cc, E, 2); tick(E, A, 2); dot(E); dot(G, '#2A2140', 8); out(E, 'E'); txt([G[0] + 6, G[1] - 26], 'G'); along(B, G, String(f.v), '#D6336C', -1); along(G, E, '?', '#2F6FE0', -1); }
  if (k === 'q8') {
    const G2 = cen(G, B, Cc);
    poly([G, B, Cc], '#DDEBFF'); line(A, D, '#2A2140', 4); line(G, D, '#FF6B6B', 6);
    dot(D); dot(G, '#2A2140', 8); dot(G2, '#9B6BFF', 9); out(D, 'D');
    txt([G[0] + 26, G[1] - 10], 'G'); txt([G2[0] + 28, G2[1] - 6], "G'", '#9B6BFF', 28);
    tick(B, D, 1); tick(D, Cc, 1);
  }
  out(A, 'A'); out(B, 'B'); out(Cc, 'C');
  return svg;
}
return { shuffle, TYPES, setOf, fig };
})();
