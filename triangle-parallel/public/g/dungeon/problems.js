// 평행선 던전 문제 만들기(매번 숫자가 바뀐다). 브라우저에서는 window.DPROB, 검산 스크립트에서는 module.exports.
//   1층 비례식 빈칸에 선분 끌어다 놓기(S, 계산 없음) · 2층 평행선 사이의 선분(B) · 3층 삼각형 두 변의 중점 연결(C) · 보스 사다리꼴(D)
// 문제마다 그림 숫자(lab)와 정답(ans)을 함께 만들고, scripts/verify-dungeon.mjs가 그림 숫자로 정답을 다시 계산해 본다.
(function (root) {
  const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const C1 = '#2f6fe0', C2 = '#e0572f';

  // 정답과 헷갈리기 쉬운 오답으로 보기 만들기
  function options(ans, cands, n) {
    const out = [ans];
    const pool = [...cands, ans + 1, ans - 1, ans + 2, ans * 2, ans - 2, ans + 3];
    for (const c of pool) {
      if (out.length >= n) break;
      if (Number.isInteger(c) && c > 0 && !out.includes(c)) out.push(c);
    }
    return shuffle(out);
  }

  // ---------- 1층: 삼각형 한 변에 평행한 선분(길이 구하기) ----------
  // 삼각형 모양: AB : AC = s : t 가 되게 그린다(s ≠ t 이므로 이등변·정삼각형이 나오지 않음)
  const RATIO_A = [
    [[1, 2], [2, 1], [2, 3], [3, 2]],
    [[1, 2], [2, 1], [2, 3], [3, 2], [3, 1]],
    [[2, 3], [3, 2], [3, 4], [4, 3], [3, 5], [5, 3]],
  ];
  const MUL_A = [[1, 3], [2, 4], [2, 5]];
  // 세 변(AB = 1, AC = r, BC)이 서로 10% 넘게 다르도록 꼭지각을 고른다
  // 밑각 B, C가 모두 34°~76°(직각삼각형·둔각삼각형처럼 보이지 않게)
  const baseOk = (ab, ac, bc) => {
    const B = (Math.acos((ab * ab + bc * bc - ac * ac) / (2 * ab * bc)) * 180) / Math.PI;
    const C = (Math.acos((ac * ac + bc * bc - ab * ab) / (2 * ac * bc)) * 180) / Math.PI;
    return B > 34 && B < 76 && C > 34 && C < 76;
  };
  function triShape(s, t) {
    // 그림의 AB : AC는 문제의 비를 따르되 너무 길쭉하지 않게(0.65 ~ 1.55배)
    const r = Math.max(0.65, Math.min(1.55, t / s));
    for (let i = 0; i < 200; i++) {
      const ang = 48 + Math.random() * 46;
      const bc = Math.sqrt(1 + r * r - 2 * r * Math.cos((ang * Math.PI) / 180));
      const L = [1, r, bc].sort((x, y) => x - y);
      if (L[1] / L[0] > 1.12 && L[2] / L[1] > 1.12 && baseOk(1, r, bc)) return { r, ang, tilt: (Math.random() - 0.5) * 20 };
    }
    return { r: 1.3, ang: 83.6, tilt: 0 }; // AB : AC : BC = 1 : 1.3 : 1.55, 밑각 약 56°·40°
  }
  function genA(kind, diff) {
    const d = Math.max(0, Math.min(2, diff ?? 1));
    const [m, n] = pick(RATIO_A[d]);
    let s = ri(MUL_A[d][0], MUL_A[d][1]), t = ri(MUL_A[d][0], MUL_A[d][1]);
    while (t === s || t / s > 2 || s / t > 2) t = ri(MUL_A[d][0], MUL_A[d][1] + 1);
    const u = d === 0 ? ri(1, 3) : ri(2, 4 + d);
    const k = m / (m + n);
    const shape = triShape(s, t);
    if (kind === 'A1') {
      const ans = n * t;
      return {
        kind, floor: 1, fig: { type: 'tri', k, ...shape, lab: { AD: m * s, DB: n * s, AE: m * t, EC: 'x' }, hl: 'A1' },
        q: 'DE ∥ BC일 때, x의 값은?', rel: 'AD : DB = AE : EC',
        ans, opts: (c) => options(ans, [(m + n) * t, n * s, m * t + n * s - m * s, m * t], c),
        explain: `AD : DB = AE : EC 이므로 ${m * s} : ${n * s} = ${m * t} : x → x = ${ans}`,
      };
    }
    if (kind === 'A2') {
      const ans = m * u;
      return {
        kind, floor: 1, fig: { type: 'tri', k, ...shape, lab: { AD: m * s, DB: n * s, BC: (m + n) * u, DE: 'x' }, hl: 'A2' },
        q: 'DE ∥ BC일 때, x의 값은?', rel: 'AD : AB = DE : BC',
        ans, opts: (c) => options(ans, [n * u, (m + n) * u - n * s, Math.round((m * s * (m + n) * u) / (n * s)), (m + n) * u - ans], c),
        explain: `AB = ${m * s} + ${n * s} = ${(m + n) * s}, AD : AB = DE : BC 이므로 ${m * s} : ${(m + n) * s} = x : ${(m + n) * u} → x = ${ans}`,
      };
    }
    const ans = (m + n) * u;
    return {
      kind: 'A3', floor: 1, fig: { type: 'tri', k, ...shape, lab: { AD: m * s, DB: n * s, DE: m * u, BC: 'x' }, hl: 'A2' },
      q: 'DE ∥ BC일 때, x의 값은?', rel: 'AD : AB = DE : BC',
      ans, opts: (c) => options(ans, [n * u, m * u + n * s, Math.round((m * u * n * s) / (m * s)), m * u * 2], c),
      explain: `AB = ${m * s} + ${n * s} = ${(m + n) * s}, AD : AB = DE : BC 이므로 ${m * s} : ${(m + n) * s} = ${m * u} : x → x = ${ans}`,
    };
  }

  // 1층 복잡한 문제(두 단계): A4 = 전체 AB가 주어지고 EC 구하기, A5 = AD를 미지수로 놓고 식 세우기
  function genA2(kind) {
    const [m, n] = pick([[2, 3], [3, 2], [3, 4], [4, 3], [3, 5], [5, 3]]);
    let s = ri(2, 4), t = ri(2, 5);
    while (t === s || t / s > 2 || s / t > 2) t = ri(2, 5);
    const u = ri(2, 5);
    const shape = triShape(s, t);
    const k = m / (m + n);
    if (kind === 'A4') {
      const AD = m * s, AB = (m + n) * s, AE = m * t, AC = (m + n) * t, ans = n * t;
      return {
        kind, floor: 1, fig: { type: 'tri', k, ...shape, lab: { AD, AB, AE, EC: 'x' }, hl: 'A2' },
        q: 'DE ∥ BC일 때, x의 값은?', rel: 'AD : AB = AE : AC',
        ans, opts: (c) => options(ans, [AC, AE, AB - AD, Math.round((AE * (AB - AD)) / AB)], c),
        explain: `AD : AB = AE : AC 이므로 ${AD} : ${AB} = ${AE} : AC → AC = ${AC}, x = EC = ${AC} − ${AE} = ${ans}`,
      };
    }
    const DB = n * s, DE = m * u, BC = (m + n) * u, ans = m * s;
    return {
      kind: 'A5', floor: 1, fig: { type: 'tri', k, ...shape, lab: { AD: 'x', DB, DE, BC }, hl: 'A2' },
      q: 'DE ∥ BC일 때, x의 값은?', rel: 'AD : AB = DE : BC',
      ans, opts: (c) => options(ans, [Math.round((DB * DE) / BC), BC - DE, DB + 1, Math.round((DB * BC) / DE)], c),
      explain: `x : (x + ${DB}) = ${DE} : ${BC} → ${BC}x = ${DE}x + ${DE * DB} → ${BC - DE}x = ${DE * DB} → x = ${ans}`,
    };
  }

  // ---------- 1층(쉬움): 비례식의 빈칸에 알맞은 선분 끌어다 놓기 ----------
  // 계산 없이 "어느 선분끼리 짝인지"만 찾는다. 숫자도 작게(2 : 4 = 3 : 6 같은) 보여 준다.
  const SEGS = ['AD', 'DB', 'AB', 'AE', 'EC', 'AC', 'DE', 'BC'];
  // AB = 1, AC = c, BC = b 로 두고 각 선분의 길이(c, b는 아무 값이어도 되므로 두 번 넣어 확인)
  const segLen = (k, c, b) => ({ AD: k, DB: 1 - k, AB: 1, AE: k * c, EC: (1 - k) * c, AC: c, DE: k * b, BC: b });
  function dragValid(p, x, y) {
    if (!x || !y || x === y) return false;
    if (x === p.left[0] && y === p.left[1]) return false; // 왼쪽과 똑같이 쓰기는 정답이 아님
    return [[1.7, 2.3], [2.9, 1.3]].every(([c, b]) => {
      const L = segLen(p.fig.k, c, b);
      return Math.abs(L[p.left[0]] * L[y] - L[p.left[1]] * L[x]) < 1e-9;
    });
  }
  function genS(kind) {
    const [m, n] = pick([[1, 2], [2, 1], [3, 1], [2, 3], [3, 2]]);
    const s = pick([1, 2, 3]);
    let t = pick([1, 2, 3]);
    while (t === s || t / s > 2 || s / t > 2) t = pick([1, 2, 3, 4]);
    const k = m / (m + n);
    const lab = { AD: m * s, DB: n * s, AE: m * t, EC: n * t };
    const V = {
      S1: { left: ['AD', 'DB'], ans: ['AE', 'EC'], hl: 'A1', rel: 'A에서 가까운 선분끼리, 먼 선분끼리 짝이에요' },
      S2: { left: ['AD', 'AB'], ans: ['AE', 'AC'], hl: 'A2', rel: '작은 △ADE의 변 : 큰 △ABC의 변' },
      S3: { left: ['AE', 'EC'], ans: ['AD', 'DB'], hl: 'A1', rel: 'A에서 가까운 선분끼리, 먼 선분끼리 짝이에요' },
      S4: { left: ['DE', 'BC'], ans: ['AD', 'AB'], hl: 'A2', rel: '작은 △ADE의 변 : 큰 △ABC의 변' },
    }[kind];
    const p = {
      kind, floor: 1, drag: true, left: V.left, ans: V.ans, rel: V.rel,
      fig: { type: 'tri', k, ...triShape(s, t), lab, hl: V.hl },
      q: 'DE ∥ BC일 때, 빈칸에 알맞은 선분을 끌어다 놓아요.',
      explain: `${V.left[0]} : ${V.left[1]} = ${V.ans[0]} : ${V.ans[1]}`,
    };
    // 보기 선분: 정답 짝 + 헷갈리는 선분(수준에 따라 4·6·8개)
    p.chips = (count) => {
      const others = shuffle(SEGS.filter((x) => !V.ans.includes(x) && !V.left.includes(x)));
      const extra = shuffle(SEGS.filter((x) => V.left.includes(x)));
      return shuffle([...V.ans, ...others, ...extra].slice(0, Math.min(count, 8)));
    };
    p.check = (x, y) => dragValid(p, x, y);
    return p;
  }

  // ---------- 2층: 평행선 사이의 선분 ----------
  // 난이도 0: 1 : 2 같은 쉬운 비와 작은 수 → 2: 3 : 4, 2 : 5 같은 비와 큰 수
  const RATIO_B = [
    [[1, 2], [2, 1], [1, 3], [3, 1]],
    [[1, 2], [2, 1], [2, 3], [3, 2], [1, 3], [3, 1]],
    [[3, 4], [4, 3], [2, 5], [5, 2], [3, 5], [5, 3], [4, 5]],
  ];
  const MUL_B = [[1, 3], [2, 4], [2, 5]];
  function genB(kind, diff) {
    const d = Math.max(0, Math.min(2, diff ?? 1));
    const [p, q] = pick(RATIO_B[d]);
    let s = ri(MUL_B[d][0], MUL_B[d][1]), t = ri(MUL_B[d][0], MUL_B[d][1]);
    while (t === s) t = ri(MUL_B[d][0], MUL_B[d][1] + 1);
    const slope = { l: 0.08 + Math.random() * 0.27, r: 0.12 + Math.random() * 0.3 };
    if (kind === 'B1') {
      const ans = q * t;
      return {
        kind, floor: 2, fig: { type: 'par', p, q, ...slope, lab: { AB: p * s, BC: q * s, DE: p * t, EF: 'x' } },
        q: 'l ∥ m ∥ n일 때, x의 값은?', rel: 'AB : BC = DE : EF',
        ans, opts: (c) => options(ans, [q * s, (p + q) * t, p * t + q * s - p * s, p * t], c),
        explain: `AB : BC = DE : EF 이므로 ${p * s} : ${q * s} = ${p * t} : x → x = ${ans}`,
      };
    }
    const ans = p * t;
    return {
      kind: 'B2', floor: 2, fig: { type: 'par', p, q, ...slope, lab: { AB: p * s, BC: q * s, DE: 'x', EF: q * t } },
      q: 'l ∥ m ∥ n일 때, x의 값은?', rel: 'AB : BC = DE : EF',
      ans, opts: (c) => options(ans, [p * s, q * s, (p + q) * t - q * t + 1, q * t], c),
      explain: `AB : BC = DE : EF 이므로 ${p * s} : ${q * s} = x : ${q * t} → x = ${ans}`,
    };
  }

  // 두 직선이 평행선 사이에서 서로 교차하는 그림(X자). 비는 그대로 AB : BC = DE : EF
  function crossShape(p, q) {
    const m = p / (p + q);
    // 교차점 X(높이 c)를 먼저 정하고, 아래쪽 F를 고른 뒤 위쪽 D를 X를 지나도록 정한다
    for (let i = 0; i < 400; i++) {
      const c = 0.25 + Math.random() * 0.53; // 교차점의 높이(0 = l, 1 = n)
      if (Math.abs(c - m) < 0.17) continue; // 교차점이 가운데 직선 m 위의 점과 겹치지 않게
      const ax = 30 + Math.random() * 40, cx = 240 + Math.random() * 40;
      const xX = ax + (cx - ax) * c;
      const fx = 15 + Math.random() * Math.max(1, xX - 55);
      const dx = xX + ((xX - fx) * c) / (1 - c);
      if (dx <= 312 && dx - ax >= 70 && cx - fx >= 90) return { ax, cx, dx, fx };
    }
    return { ax: 40, cx: 270, dx: 290, fx: 30 };
  }
  function genB2(kind, diff) {
    const d = diff ?? 1;
    const [p, q] = pick(RATIO_B[d]);
    let s = ri(MUL_B[d][0], MUL_B[d][1]), t = ri(MUL_B[d][0], MUL_B[d][1]);
    while (t === s) t = ri(MUL_B[d][0], MUL_B[d][1] + 1);
    if (kind === 'B3') {
      const xAtTop = Math.random() < 0.5;
      const lab = xAtTop ? { AB: p * s, BC: q * s, DE: 'x', EF: q * t } : { AB: p * s, BC: q * s, DE: p * t, EF: 'x' };
      const ans = xAtTop ? p * t : q * t;
      return {
        kind, floor: 2, fig: { type: 'cross', p, q, ...crossShape(p, q), lab },
        q: '두 직선이 서로 만나도 l ∥ m ∥ n이면 비가 같아요. x의 값은?', rel: 'AB : BC = DE : EF',
        ans, opts: (c) => options(ans, [xAtTop ? q * s : q * s, (p + q) * t, xAtTop ? q * t : p * t, ans + s], c),
        explain: `AB : BC = DE : EF 이므로 ${p * s} : ${q * s} = ${xAtTop ? 'x' : p * t} : ${xAtTop ? q * t : 'x'} → x = ${ans}`,
      };
    }
    // B4: 왼쪽 직선 전체 AC가 주어지고 AB 구하기
    const AC = (p + q) * s, ans = p * s;
    return {
      kind: 'B4', floor: 2, fig: { type: 'par', p, q, l: 0.1 + Math.random() * 0.2, r: 0.15 + Math.random() * 0.25, lab: { AB: 'x', AC, DE: p * t, EF: q * t } },
      q: 'l ∥ m ∥ n일 때, x의 값은?', rel: 'AB : AC = DE : DF',
      ans, opts: (c) => options(ans, [q * s, AC - p * t, Math.round((AC * p) / q), AC - ans + 1], c),
      explain: `DF = ${p * t} + ${q * t} = ${(p + q) * t}, AB : AC = DE : DF 이므로 x : ${AC} = ${p * t} : ${(p + q) * t} → x = ${ans}`,
    };
  }

  // ---------- 3층: 삼각형 두 변의 중점을 연결한 선분 ----------
  // 중점 연결 그림이 늘 가로로만 나오지 않게 30°~65° 돌린다(왼쪽·오른쪽 무작위)
  const midTurn = () => (Math.random() < 0.5 ? -1 : 1) * (30 + Math.random() * 35);
  function genC(kind) {
    if (kind === 'C3') {
      // 세 변이 모두 다르고(서로 12% 넘게 차이), 삼각형이 되고, 둘레가 짝수인 길이
      let a, b, c;
      for (let i = 0; i < 200; i++) {
        a = ri(6, 18); b = ri(6, 18); c = ri(6, 18);
        const L = [a, b, c].sort((x, y) => x - y);
        if ((a + b + c) % 2 === 0 && L[0] + L[1] > L[2] * 1.15 && L[1] / L[0] > 1.12 && L[2] / L[1] > 1.12 && baseOk(a, c, b)) break;
        a = 10; b = 14; c = 8;
      }
      const ans = (a + b + c) / 2;
      return {
        kind, floor: 3, fig: { type: 'mid3', r: c / a, ang: (Math.acos((a * a + c * c - b * b) / (2 * a * c)) * 180) / Math.PI, tilt: (Math.random() - 0.5) * 16, lab: { AB: a, BC: b, CA: c } },
        q: '세 점 D, E, F가 각 변의 중점일 때, △DEF의 둘레는?', rel: '△DEF의 각 변 = 마주 보는 변의 ½',
        ans, opts: (n) => options(ans, [a + b + c, Math.round((a + b + c) / 3), ans + 4, ans - 3], n),
        explain: `중점 연결 선분은 마주 보는 변의 ½ 이므로 △DEF의 둘레 = (${a} + ${b} + ${c}) ÷ 2 = ${ans}`,
      };
    }
    const u = ri(3, 12);
    if (kind === 'C4') {
      const ans = u;
      return {
        kind, floor: 3, fig: { type: 'mid', conv: true, ...triShape(2, pick([3, 4, 5]) / 2 + 0.2), turn: midTurn(), lab: { AC: 2 * u, NC: 'x' } },
        q: '점 M이 AB의 중점이고 MN ∥ BC일 때, x의 값은?', rel: 'M이 중점이고 MN ∥ BC → N도 AC의 중점',
        ans, opts: (n) => options(ans, [2 * u, 4 * u, u + 2, Math.max(1, u - 2)], n),
        explain: `MN ∥ BC이고 M이 AB의 중점이므로 N도 AC의 중점이에요. NC = ½ AC = ½ × ${2 * u} = ${ans}`,
      };
    }
    if (kind === 'C1') {
      const ans = u;
      return {
        kind, floor: 3, fig: { type: 'mid', ...triShape(2, pick([3, 4, 5]) / 2 + 0.2), turn: midTurn(), lab: { BC: 2 * u, MN: 'x' } },
        q: '점 M, N이 AB, AC의 중점일 때, x의 값은?', rel: 'MN = ½ BC',
        ans, opts: (n) => options(ans, [4 * u, 2 * u, u + 2, Math.max(1, u - 3)], n),
        explain: `중점연결정리: MN ∥ BC, MN = ½ BC = ½ × ${2 * u} = ${ans}`,
      };
    }
    const ans = 2 * u;
    return {
      kind: 'C2', floor: 3, fig: { type: 'mid', ...triShape(pick([3, 4, 5]), 2), turn: midTurn(), lab: { BC: 'x', MN: u } },
      q: '점 M, N이 AB, AC의 중점일 때, x의 값은?', rel: 'MN = ½ BC',
      ans, opts: (n) => options(ans, [u % 2 ? u + 1 : u / 2, u, 3 * u, ans + 2], n),
      explain: `중점연결정리: BC = 2MN = 2 × ${u} = ${ans}`,
    };
  }

  // ---------- 보스: 사다리꼴 ----------
  function genD(kind) {
    let a = ri(4, 10);
    // MP = ½ BC 가 자연수가 되도록 D3에서는 BC를 짝수로
    if (kind === 'D3' && a % 2) a += 1;
    const b = a + 2 * ri(2, 5);
    const mn = (a + b) / 2;
    if (kind === 'D1') {
      return {
        kind, floor: 4, fig: { type: 'trap', a, b, lab: { AD: a, BC: b, MN: 'x' } },
        q: 'AD ∥ BC인 사다리꼴에서 M, N이 AB, DC의 중점일 때, x의 값은?', rel: 'MN = ½ (AD + BC)',
        ans: mn, opts: (n) => options(mn, [a + b, b - a, (b - a) / 2, b / 2], n),
        explain: `MN = ½ (AD + BC) = ½ × (${a} + ${b}) = ${mn}`,
      };
    }
    if (kind === 'D2') {
      return {
        kind, floor: 4, fig: { type: 'trap', a, b, lab: { AD: a, BC: 'x', MN: mn } },
        q: 'AD ∥ BC인 사다리꼴에서 M, N이 AB, DC의 중점일 때, x의 값은?', rel: 'MN = ½ (AD + BC)',
        ans: b, opts: (n) => options(b, [2 * mn, mn + a, mn - a > 0 ? mn - a : mn + 2, 2 * mn + a], n),
        explain: `${mn} = ½ × (${a} + x) 이므로 ${a} + x = ${2 * mn} → x = ${b}`,
      };
    }
    const ans = b / 2;
    return {
      kind: 'D3', floor: 4, fig: { type: 'trap', a, b, diag: true, lab: { AD: a, BC: b, MP: 'x' } },
      q: 'AD ∥ BC인 사다리꼴에서 M, N이 AB, DC의 중점이고 P가 MN과 AC의 교점일 때, x의 값은?', rel: '△ABC에서 MP = ½ BC',
      ans, opts: (n) => options(ans, [a / 2, mn, b, a], n),
      explain: `△ABC에서 M, P는 AB, AC의 중점이므로 MP = ½ BC = ½ × ${b} = ${ans}`,
    };
  }

  // 한 층의 방들 중 똑같은 문제(그림 숫자까지 같은 것)가 있으면 다시 만든다
  const sig = (p) => `${p.kind}|${JSON.stringify(p.fig.lab)}|${p.left || ''}`;
  const unique = (make) => { let rooms = make(); for (let i = 0; i < 30 && new Set(rooms.map(sig)).size !== rooms.length; i++) rooms = make(); return rooms; };
  const FLOORS0 = {
    // 1층: 끌어다 놓기 3 → 길이 구하기 쉬움·보통·어려움 → 두 단계 계산 2
    1: () => [genS('S1'), ...shuffle(['S2', 'S3', 'S4']).slice(0, 2).map(genS), genA('A1', 0), genA(pick(['A1', 'A2']), 1), genA(pick(['A2', 'A3']), 2), ...shuffle([genA2('A4'), genA2('A5')])],
    // 2층: 쉬운 수 → 교차하는 두 직선 → 큰 수·전체 길이
    2: () => [genB('B1', 0), genB('B2', 0), genB2('B3', 0), genB('B1', 1), genB2('B3', 1), genB('B2', 2), genB2('B4', 2)],
    3: () => ['C1', ...shuffle(['C2', 'C4', 'C3'])].map(genC),
    4: () => ['D1', 'D2', 'D3'].map(genD),
  };
  const FLOORS = { 1: () => unique(FLOORS0[1]), 2: () => unique(FLOORS0[2]), 3: () => unique(FLOORS0[3]), 4: () => unique(FLOORS0[4]) };

  // ---------- 그림 ----------
  const f1 = (v) => Math.round(v * 10) / 10;
  const P2 = (p) => `${f1(p[0])},${f1(p[1])}`;
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  function segLab(a, b, text, away, color, d) {
    const m = lerp(a, b, 0.5);
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
    if (nx * (away[0] - m[0]) + ny * (away[1] - m[1]) > 0) { nx = -nx; ny = -ny; }
    // 교과서처럼 선분의 처음과 끝을 잇는 점선 곡선을 바깥쪽으로 그리고, 곡선 한가운데에 길이를 적는다
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const h = Math.max(14, Math.min(2 * (d || 16) + 4, len * 0.42)); // 곡선이 부푸는 정도(조절점 거리)
    const c = [m[0] + nx * h, m[1] + ny * h];
    const x = m[0] + nx * (h / 2), y = m[1] + ny * (h / 2); // 2차 곡선의 한가운데
    const isX = text === 'x';
    const arc = `<path d="M${f1(a[0])} ${f1(a[1])} Q${f1(c[0])} ${f1(c[1])} ${f1(b[0])} ${f1(b[1])}" fill="none" stroke="${color || '#7a8494'}" stroke-width="1.4" stroke-dasharray="4 3"/>`;
    return `${arc}<text x="${f1(x)}" y="${f1(y)}" class="dl${isX ? ' dx' : ''}" ${color ? `fill="${color}"` : ''}>${text}</text>`;
  }
  const line = (a, b, w, c, extra) => `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="${c || '#1c2230'}" stroke-width="${w || 2.6}" stroke-linecap="round" ${extra || ''}/>`;
  const dot = (p) => `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="3.4" fill="#1c2230"/>`;
  const name = (p, t, dx, dy) => `<text x="${f1(p[0] + dx)}" y="${f1(p[1] + dy)}" class="dn">${t}</text>`;
  function arrowMark(a, b, n) { // 평행 표시(화살표 n개)
    const m = lerp(a, b, 0.5); const ux = (b[0] - a[0]) / Math.hypot(b[0] - a[0], b[1] - a[1]), uy = (b[1] - a[1]) / Math.hypot(b[0] - a[0], b[1] - a[1]);
    let s = '';
    for (let i = 0; i < n; i++) {
      const c = [m[0] + ux * (i * 7 - (n - 1) * 3.5), m[1] + uy * (i * 7 - (n - 1) * 3.5)];
      s += `<path d="M${f1(c[0] - ux * 5 - uy * 5)} ${f1(c[1] - uy * 5 + ux * 5)} L${f1(c[0])} ${f1(c[1])} L${f1(c[0] - ux * 5 + uy * 5)} ${f1(c[1] - uy * 5 - ux * 5)}" fill="none" stroke="#1c2230" stroke-width="2"/>`;
    }
    return s;
  }
  function tick(a, b, n) { // 같은 길이 표시
    const m = lerp(a, b, 0.5); const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    let s = '';
    for (let i = 0; i < n; i++) {
      const c = [m[0] + ux * (i * 5 - (n - 1) * 2.5), m[1] + uy * (i * 5 - (n - 1) * 2.5)];
      s += line([c[0] - uy * 6, c[1] + ux * 6], [c[0] + uy * 6, c[1] - ux * 6], 2);
    }
    return s;
  }

  // A를 꼭대기로, AB 길이 1, AC 길이 r, 꼭지각 ang°, 기울기 tilt°인 삼각형을 그림 칸(330×230)에 맞춰 놓는다
  function triFit(fig) {
    const r = fig.r || 1.3, ang = ((fig.ang || 60) * Math.PI) / 180, tilt = ((fig.tilt || 0) * Math.PI) / 180;
    const a1 = -ang / 2 + tilt, a2 = ang / 2 + tilt;
    const raw0 = { A: [0, 0], B: [Math.sin(a1), Math.cos(a1)], C: [r * Math.sin(a2), r * Math.cos(a2)] };
    // 교과서처럼 밑변 BC를 수평으로 눕히고(B 왼쪽) A가 위에 오게 돌린다. 조금 기울이는 값(tilt)은 2° 남짓만 남긴다.
    const th = Math.atan2(raw0.C[1] - raw0.B[1], raw0.C[0] - raw0.B[0]) - tilt * 0.1;
    const rot = (p) => [p[0] * Math.cos(-th) - p[1] * Math.sin(-th), p[0] * Math.sin(-th) + p[1] * Math.cos(-th)];
    const raw = { A: rot(raw0.A), B: rot(raw0.B), C: rot(raw0.C) };
    if (raw.A[1] > raw.B[1]) for (const k in raw) raw[k] = [raw[k][0], -raw[k][1]];
    if (fig.turn) {
      const t2 = (fig.turn * Math.PI) / 180, c2 = Math.cos(t2), s2 = Math.sin(t2);
      for (const k in raw) raw[k] = [raw[k][0] * c2 - raw[k][1] * s2, raw[k][0] * s2 + raw[k][1] * c2];
    }
    const xs = Object.values(raw).map((p) => p[0]), ys = Object.values(raw).map((p) => p[1]);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    const sc = Math.min(240 / w, 156 / h);
    const ox = (330 - w * sc) / 2 - Math.min(...xs) * sc, oy = 32 + (162 - h * sc) / 2 - Math.min(...ys) * sc;
    const P = {};
    for (const k in raw) P[k] = [raw[k][0] * sc + ox, raw[k][1] * sc + oy];
    return P;
  }
  const outName = (p, G, t, d) => { const dx = p[0] - G[0], dy = p[1] - G[1], L = Math.hypot(dx, dy) || 1; return name(p, t, (dx / L) * (d || 14), (dy / L) * (d || 14)); };
  function svg(fig, hl) {
    let s = '';
    if (fig.type === 'tri') {
      const { A, B, C } = triFit(fig);
      const D = lerp(A, B, fig.k), E = lerp(A, C, fig.k);
      const L = fig.lab, cen = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3];
      if (hl && fig.hl === 'A1') {
        s += line(A, D, 7, C1, 'opacity=".35"') + line(A, E, 7, C1, 'opacity=".35"') + line(D, B, 7, C2, 'opacity=".35"') + line(E, C, 7, C2, 'opacity=".35"');
      } else if (hl) {
        s += `<polygon points="${[A, D, E].map(P2).join(' ')}" fill="${C1}" opacity=".18"/><polygon points="${[A, B, C].map(P2).join(' ')}" fill="none" stroke="${C2}" stroke-width="7" opacity=".3"/>`;
      }
      s += line(A, B) + line(A, C) + line(B, C) + line(D, E);
      s += arrowMark(D, E, 1) + arrowMark(B, C, 1);
      s += [A, B, C, D, E].map(dot).join('');
      s += outName(A, cen, 'A') + outName(B, cen, 'B') + outName(C, cen, 'C') + outName(D, lerp(E, cen, 0.5), 'D', 15) + outName(E, lerp(D, cen, 0.5), 'E', 15);
      const col = (k) => (!hl ? null : fig.hl === 'A1' ? ({ AD: C1, AE: C1, DB: C2, EC: C2 }[k]) : ({ AD: C1, DE: C1 }[k] || C2));
      if (L.AD != null) s += segLab(A, D, L.AD, cen, col('AD'));
      if (L.DB != null) s += segLab(D, B, L.DB, cen, col('DB'));
      if (L.AE != null) s += segLab(A, E, L.AE, cen, col('AE'));
      if (L.EC != null) s += segLab(E, C, L.EC, cen, col('EC'));
      if (L.DE != null) s += segLab(D, E, L.DE, B, col('DE'), 13);
      if (L.BC != null) s += segLab(B, C, L.BC, A, col('BC'), 18);
      if (L.AB != null) s += segLab(A, B, L.AB, cen, hl ? C2 : null, 40); // 전체 길이는 큰 점선 곡선
      if (L.AC != null) s += segLab(A, C, L.AC, cen, hl ? C2 : null, 40);
    } else if (fig.type === 'par') {
      const top = 30, U = 168 / (fig.p + fig.q);
      const y = [top, top + fig.p * U, top + (fig.p + fig.q) * U];
      const xl = (yy) => 70 + (yy - top) * (fig.l || 0.32), xr = (yy) => 250 - (yy - top) * (fig.r || 0.45);
      const A = [xl(y[0]), y[0]], B = [xl(y[1]), y[1]], C = [xl(y[2]), y[2]];
      const D = [xr(y[0]), y[0]], E = [xr(y[1]), y[1]], F = [xr(y[2]), y[2]];
      if (hl) s += line(A, B, 7, C1, 'opacity=".35"') + line(D, E, 7, C1, 'opacity=".35"') + line(B, C, 7, C2, 'opacity=".35"') + line(E, F, 7, C2, 'opacity=".35"');
      y.forEach((yy, i) => { s += line([14, yy], [300, yy], 2.2) + `<text x="306" y="${f1(yy + 5)}" class="dn" text-anchor="start">${'lmn'[i]}</text>`; });
      s += line([xl(top - 18), top - 18], [xl(y[2] + 18), y[2] + 18], 2.6) + line([xr(top - 18), top - 18], [xr(y[2] + 18), y[2] + 18], 2.6);
      s += [A, B, C, D, E, F].map(dot).join('');
      s += name(A, 'A', -12, -6) + name(B, 'B', -12, -6) + name(C, 'C', -12, -6) + name(D, 'D', 13, -6) + name(E, 'E', 13, -6) + name(F, 'F', 13, -6);
      const L = fig.lab, left = [0, 120], right = [320, 120];
      s += segLab(A, B, L.AB, right, hl ? C1 : null, 20);
      if (L.BC != null) s += segLab(B, C, L.BC, right, hl ? C2 : null, 20);
      if (L.AC != null) s += segLab(A, C, L.AC, right, hl ? C2 : null, 44);
      s += segLab(D, E, L.DE, left, hl ? C1 : null, 20) + segLab(E, F, L.EF, left, hl ? C2 : null, 20);
    } else if (fig.type === 'cross') {
      const top = 30, U = 168 / (fig.p + fig.q);
      const y = [top, top + fig.p * U, top + (fig.p + fig.q) * U];
      const on = (x0, x1, yy) => [x0 + ((x1 - x0) * (yy - y[0])) / (y[2] - y[0]), yy];
      const A = on(fig.ax, fig.cx, y[0]), B = on(fig.ax, fig.cx, y[1]), C = on(fig.ax, fig.cx, y[2]);
      const D = on(fig.dx, fig.fx, y[0]), E = on(fig.dx, fig.fx, y[1]), F = on(fig.dx, fig.fx, y[2]);
      if (hl) s += line(A, B, 7, C1, 'opacity=".35"') + line(D, E, 7, C1, 'opacity=".35"') + line(B, C, 7, C2, 'opacity=".35"') + line(E, F, 7, C2, 'opacity=".35"');
      y.forEach((yy, i) => { s += line([10, yy], [300, yy], 2.2) + `<text x="306" y="${f1(yy + 5)}" class="dn" text-anchor="start">${'lmn'[i]}</text>`; });
      const ext = (P, Q, d) => { const L2 = Math.hypot(Q[0] - P[0], Q[1] - P[1]); return [P[0] + ((P[0] - Q[0]) / L2) * d, P[1] + ((P[1] - Q[1]) / L2) * d]; };
      s += line(ext(A, C, 16), ext(C, A, 16), 2.6) + line(ext(D, F, 16), ext(F, D, 16), 2.6);
      s += [A, B, C, D, E, F].map(dot).join('');
      s += name(A, 'A', -12, -8) + name(B, 'B', -13, -8) + name(C, 'C', 12, 12) + name(D, 'D', 12, -8) + name(E, 'E', 13, -8) + name(F, 'F', -12, 12);
      const L = fig.lab;
      s += segLab(A, B, L.AB, E, hl ? C1 : null, 18) + segLab(B, C, L.BC, E, hl ? C2 : null, 18);
      s += segLab(D, E, L.DE, B, hl ? C1 : null, 18) + segLab(E, F, L.EF, B, hl ? C2 : null, 18);
    } else if (fig.type === 'mid') {
      const { A, B, C } = triFit(fig);
      const M = lerp(A, B, 0.5), N = lerp(A, C, 0.5);
      const G = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3];
      if (hl) s += line(M, N, 8, C1, 'opacity=".35"') + line(B, C, 8, C2, 'opacity=".35"');
      s += line(A, B) + line(A, C) + line(B, C) + line(M, N);
      s += fig.conv ? tick(A, M, 1) + tick(M, B, 1) + arrowMark(M, N, 1) + arrowMark(B, C, 1) : tick(A, M, 1) + tick(M, B, 1) + tick(A, N, 2) + tick(N, C, 2);
      s += [A, B, C, M, N].map(dot).join('');
      s += outName(A, G, 'A') + outName(B, G, 'B') + outName(C, G, 'C') + outName(M, lerp(N, G, 0.5), 'M', 15) + outName(N, lerp(M, G, 0.5), 'N', 15);
      if (fig.lab.MN != null) s += segLab(M, N, fig.lab.MN, B, hl ? C1 : null, 13);
      if (fig.lab.BC != null) s += segLab(B, C, fig.lab.BC, A, hl ? C2 : null, 18);
      if (fig.lab.AC != null) s += segLab(A, C, fig.lab.AC, G, hl ? C2 : null, 40);
      if (fig.lab.NC != null) s += segLab(N, C, fig.lab.NC, G, hl ? C1 : null, 16);
    } else if (fig.type === 'mid3') {
      const { A, B, C } = triFit(fig);
      const D = lerp(B, C, 0.5), E = lerp(C, A, 0.5), F = lerp(A, B, 0.5);
      if (hl) s += line(E, F, 7, C1, 'opacity=".35"') + line(B, C, 7, C1, 'opacity=".25"') + line(F, D, 7, C2, 'opacity=".35"') + line(C, A, 7, C2, 'opacity=".25"') + line(D, E, 7, '#2a9d4b', 'opacity=".35"') + line(A, B, 7, '#2a9d4b', 'opacity=".25"');
      s += `<polygon points="${[D, E, F].map(P2).join(' ')}" fill="#ffd93d" opacity=".35"/>`;
      s += line(A, B) + line(B, C) + line(C, A) + line(D, E, 2.2) + line(E, F, 2.2) + line(F, D, 2.2);
      s += [A, B, C, D, E, F].map(dot).join('');
      const cen = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3];
      s += outName(A, cen, 'A') + outName(B, cen, 'B') + outName(C, cen, 'C') + outName(D, cen, 'D', -13) + outName(E, cen, 'E', 16) + outName(F, cen, 'F', 16);
      s += segLab(A, B, fig.lab.AB, cen, null, 34) + segLab(B, C, fig.lab.BC, cen, null, 22) + segLab(C, A, fig.lab.CA, cen, null, 34);
    } else if (fig.type === 'trap') {
      const w = 240 * (fig.a / fig.b);
      const A = [165 - w / 2, 40], Dp = [165 + w / 2, 40], B = [45, 190], C = [285, 190];
      const M = lerp(A, B, 0.5), N = lerp(Dp, C, 0.5);
      if (hl) s += line(M, N, 8, C1, 'opacity=".35"') + line(A, Dp, 8, C2, 'opacity=".3"') + line(B, C, 8, C2, 'opacity=".3"');
      s += line(A, Dp) + line(Dp, C) + line(C, B) + line(B, A) + line(M, N);
      s += arrowMark(A, Dp, 1) + arrowMark(B, C, 1);
      s += tick(A, M, 1) + tick(M, B, 1) + tick(Dp, N, 2) + tick(N, C, 2);
      let P = null;
      if (fig.diag) { s += line(A, C, 2, '#6b7588', 'stroke-dasharray="5 4"'); P = lerp(M, N, (fig.b / 2) / ((fig.a + fig.b) / 2)); s += dot(P) + name(P, 'P', 2, 18); }
      s += [A, Dp, B, C, M, N].map(dot).join('');
      s += name(A, 'A', -6, -9) + name(Dp, 'D', 6, -9) + name(B, 'B', -12, 6) + name(C, 'C', 12, 6) + name(M, 'M', -15, -2) + name(N, 'N', 15, -2);
      const L = fig.lab;
      s += segLab(A, Dp, L.AD, B, hl ? C2 : null, 14) + segLab(B, C, L.BC, A, hl ? C2 : null, 18);
      if (L.MN != null) s += segLab(M, N, L.MN, A, hl ? C1 : null, 14);
      if (L.MP != null && P) s += segLab(M, P, L.MP, A, hl ? C1 : null, 14);
    }
    return `<svg viewBox="0 0 330 230" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
  }

  const api = { FLOORS, genS, genA, genA2, genB, genB2, genC, genD, svg, options, dragValid, SEGS, triFit };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DPROB = api;
})(typeof window !== 'undefined' ? window : globalThis);
