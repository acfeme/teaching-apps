// 평행선 던전 문제 검산: 무작위로 많이 만들어 보고, 그림에 적힌 숫자만으로 정답을 다시 계산해 맞는지 본다.
// 실행: node scripts/verify-dungeon.mjs
// problems.js는 브라우저용(window.DPROB)이라 globalThis에 붙는다
await import('../public/g/dungeon/problems.js');
const P = globalThis.DPROB;

const solve = (p) => {
  const L = p.fig.lab;
  switch (p.kind) {
    case 'A1': return (L.DB * L.AE) / L.AD;
    case 'A2': return (L.BC * L.AD) / (L.AD + L.DB);
    case 'A3': return (L.DE * (L.AD + L.DB)) / L.AD;
    case 'A4': return (L.AE * L.AB) / L.AD - L.AE; // AC = AE·AB/AD, EC = AC − AE
    case 'A5': return (L.DB * L.DE) / (L.BC - L.DE); // x : (x + DB) = DE : BC
    case 'B1': return (L.BC * L.DE) / L.AB;
    case 'B2': return (L.AB * L.EF) / L.BC;
    case 'B3': return L.DE === 'x' ? (L.AB * L.EF) / L.BC : (L.BC * L.DE) / L.AB; // 교차해도 같은 비
    case 'B4': return (L.AC * L.DE) / (L.DE + L.EF); // AB : AC = DE : DF
    case 'C1': return L.BC / 2;
    case 'C2': return 2 * L.MN;
    case 'C4': return L.AC / 2; // 중점연결정리의 역: N도 중점
    case 'C3': return (L.AB + L.BC + L.CA) / 2;
    case 'D1': return (L.AD + L.BC) / 2;
    case 'D2': return 2 * L.MN - L.AD;
    case 'D3': return L.BC / 2;
    default: throw new Error(`unknown kind ${p.kind}`);
  }
};

let n = 0;
const errs = [];
const kinds = {};
for (let i = 0; i < 3000; i++) {
  for (const f of [1, 2, 3, 4]) {
    for (const p of P.FLOORS[f]()) {
      n++;
      kinds[p.kind] = (kinds[p.kind] || 0) + 1;
      if (p.drag) {
        // 1층 끌어다 놓기: 정답 짝은 맞고, 뒤집거나 왼쪽을 그대로 쓰면 틀리고, 다른 정답은 허용된 것만
        const ALT = { S1: [], S2: [['DE', 'BC']], S3: [], S4: [['AE', 'AC']] }[p.kind];
        if (!p.check(p.ans[0], p.ans[1])) errs.push(`${p.kind} answer not valid`);
        if (p.check(p.ans[1], p.ans[0])) errs.push(`${p.kind} reversed accepted`);
        if (p.check(p.left[0], p.left[1])) errs.push(`${p.kind} left copy accepted`);
        for (const x of P.SEGS) for (const y of P.SEGS) {
          if (p.check(x, y) && !(x === p.ans[0] && y === p.ans[1]) && !ALT.some(([u, v]) => u === x && v === y)) errs.push(`${p.kind} unexpected valid ${x}:${y} k=${p.fig.k}`);
        }
        for (const c of [4, 6, 8]) { const ch = p.chips(c); if (ch.length !== c || !p.ans.every((x) => ch.includes(x)) || new Set(ch).size !== c) errs.push(`${p.kind} chips ${ch}`); }
        const L = p.fig.lab;
        if (L.AD * L.EC !== L.DB * L.AE) errs.push(`${p.kind} numbers not proportional ${JSON.stringify(L)}`);
        if (Object.values(L).some((v) => v > 12)) errs.push(`${p.kind} numbers too big ${JSON.stringify(L)}`);
        const svg = P.svg(p.fig, false) + P.svg(p.fig, true);
        if (/NaN|undefined/.test(svg)) errs.push(`${p.kind} svg NaN`);
        continue;
      }
      const want = solve(p);
      if (!(Number.isInteger(p.ans) && p.ans > 0)) errs.push(`${p.kind} ans not positive int: ${p.ans}`);
      if (want !== p.ans) errs.push(`${p.kind} ans ${p.ans} != recomputed ${want} ${JSON.stringify(p.fig.lab)}`);
      if (Object.values(p.fig.lab).filter((v) => v === 'x').length !== (p.kind === 'C3' ? 0 : 1)) errs.push(`${p.kind} needs exactly one x`);
      for (const c of [3, 4]) {
        const o = p.opts(c);
        if (o.length !== c) errs.push(`${p.kind} opts length ${o.length} != ${c}`);
        if (o.filter((v) => v === p.ans).length !== 1) errs.push(`${p.kind} ans count in opts`);
        if (new Set(o).size !== o.length) errs.push(`${p.kind} duplicate opts ${o}`);
        if (o.some((v) => !Number.isInteger(v) || v <= 0)) errs.push(`${p.kind} bad opt ${o}`);
      }
      if (p.kind === 'C3') { const { AB, BC, CA } = p.fig.lab; if (AB + BC <= CA || AB + CA <= BC || BC + CA <= AB) errs.push(`C3 not a triangle ${AB},${BC},${CA}`); }
      if (p.fig.type === 'tri' && !(p.fig.k > 0 && p.fig.k < 1)) errs.push('tri k out of range');
      const svg = P.svg(p.fig, false) + P.svg(p.fig, true);
      if (/NaN|undefined/.test(svg)) errs.push(`${p.kind} svg has NaN/undefined`);
    }
  }
}
// 삼각형 그림은 이등변·정삼각형처럼 보이면 안 된다(세 변의 길이가 6% 넘게 달라야 함)
// 1층 4번째 방(길이 구하기 첫 문제)과 2층 첫 두 방은 작은 수(12 이하)만
for (let i = 0; i < 2000; i++) {
  const f1 = P.FLOORS[1](), f2 = P.FLOORS[2](), f3 = P.FLOORS[3]();
  for (const p of [...f1, ...f3]) {
    if (!['tri', 'mid', 'mid3'].includes(p.fig.type)) continue;
    const { A, B, C } = P.triFit(p.fig);
    const d = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1]);
    const L = [d(A, B), d(A, C), d(B, C)].sort((x, y) => x - y);
    if (L[1] / L[0] < 1.06 || L[2] / L[1] < 1.06) errs.push(`${p.kind} looks isosceles ${L.map(Math.round)}`);
    const ang = (P1, Q, R) => { const u = [Q[0] - P1[0], Q[1] - P1[1]], v = [R[0] - P1[0], R[1] - P1[1]]; return Math.acos((u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))) * 180 / Math.PI; };
    const angB = ang(B, A, C), angC = ang(C, A, B);
    if (angB < 33 || angB > 77 || angC < 33 || angC > 77) errs.push(`${p.kind} base angle ${Math.round(angB)},${Math.round(angC)}`);
    if (!p.fig.turn && (A[1] > B[1] - 30 || A[1] > C[1] - 30)) errs.push(`${p.kind} A not on top`);
    const xs = [A, B, C].map((q) => q[0]), ys = [A, B, C].map((q) => q[1]);
    if (Math.min(...xs) < 10 || Math.max(...xs) > 320 || Math.min(...ys) < 10 || Math.max(...ys) > 220) errs.push(`${p.kind} out of box`);
  }
  for (const p of f2.filter((q) => q.fig.type === 'cross')) { // 교차 그림: 교차점이 가운데 직선과 겹치지 않고 그림 안에
    const c = (p.fig.dx - p.fig.ax) / ((p.fig.cx - p.fig.ax) + (p.fig.dx - p.fig.fx)), m = p.fig.p / (p.fig.p + p.fig.q);
    if (!(c > 0.2 && c < 0.8) || Math.abs(c - m) < 0.15) errs.push(`${p.kind} crossing point bad c=${c.toFixed(2)} m=${m.toFixed(2)}`);
    if (p.fig.fx < 15 || p.fig.fx > 315) errs.push(`${p.kind} cross out of box`);
  }
  for (const q of f3) if (q.fig.type === 'mid' && !(Math.abs(q.fig.turn) >= 29)) errs.push('mid not turned');
  // 한 층 안에 같은 문제가 두 번 나오면 안 됨(3층은 네 유형이 하나씩)
  for (const fl of [f1, f2, f3, P.FLOORS[4]()]) { const sg = fl.map((p) => p.kind + JSON.stringify(p.fig.lab) + (p.left || '')); if (new Set(sg).size !== sg.length) errs.push(`duplicate room ${sg}`); }
  if (new Set(f3.map((p) => p.kind)).size !== 4) errs.push(`floor3 kinds ${f3.map((p) => p.kind)}`);
  for (const p of f2.filter((q) => q.fig.type === 'par')) { // 두 직선이 평행선 사이에서 엇갈리면 안 됨
    const top = 30, H = 168, xl = 70 + H * p.fig.l, xr = 250 - H * p.fig.r;
    if (xr - xl < 40) errs.push(`${p.kind} transversals cross`);
  }
  for (const p of f1) { const r = p.fig.r; if (r > 2.01 || r < 0.49) errs.push(`${p.kind} too skinny r=${r}`); if (p.fig.k < 0.33) errs.push(`${p.kind} D too close to A`); }
  if (f1.length !== 8 || !f1.slice(0, 3).every((p) => p.drag) || f1.slice(3).some((p) => p.drag) || !f1.slice(6).every((p) => ['A4', 'A5'].includes(p.kind))) errs.push('floor1 layout');
  const small = (p) => Object.values(p.fig.lab).every((v) => v === 'x' || v <= 12);
  if (!small(f1[3])) errs.push(`floor1 room4 numbers big ${JSON.stringify(f1[3].fig.lab)}`);
  if (!small(f2[0]) || !small(f2[1])) errs.push(`floor2 first rooms big ${JSON.stringify(f2[0].fig.lab)} ${JSON.stringify(f2[1].fig.lab)}`);
  if (f2.length !== 7 || f2.filter((p) => p.kind === 'B3').length !== 2 || f2[6].kind !== 'B4') errs.push('floor2 layout');
  for (const p of [...f1.slice(3), ...f2]) if (p.ans > 60) errs.push(`${p.kind} answer too big ${p.ans}`);
}
const uniq = [...new Set(errs)];
console.log(`problems ${n}`, kinds);
if (uniq.length) { console.log(`FAIL ${uniq.length}\n${uniq.slice(0, 20).join('\n')}`); process.exit(1); }
console.log('평행선 던전 문제 전부 일치');
