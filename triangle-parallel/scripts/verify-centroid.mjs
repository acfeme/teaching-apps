// 삼각형의 무게중심: 교과서·학습지 원문 수치로 정답을 다시 계산해 api/_unit-centroid.js와 대조하고,
// 학생 화면 문제 파일(public/units/centroid/problems.js)의 문항·빈칸 수·그림을 확인한다.
// 실행: node scripts/verify-centroid.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANSWERS, EXPLAIN, FB_BLANKS } from '../api/_unit-centroid.js';

// 분수 계산(정확한 유리수)
const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const fr = (n, d = 1) => { const g = gcd(n, d) || 1; return d / g === 1 ? `${n / g}` : `${n / g}/${d / g}`; };
const S = (...v) => v.map((x) => (typeof x === 'string' ? x : fr(x)));
const twoThirds = (v) => (v * 2) / 3;
const third = (v) => v / 3;

const solved = {
  1: {
    // 학습지 11쪽: DE = ½AB → 닮음비 2 : 1
    a01: S(2, 2, 1),
    // 교과서 219쪽 문제 1 (1): CG = 12, GD = 4
    a02: S(2, 1, 12 / 2, 2, 1, 4 * 2),
    // 교과서 219쪽 문제 1 (2): BD = 5, GD = 2
    a03: S(5, 2, 2 * 2, 2 * 2 + 2),
    // 교과서 220쪽 예제 1: △ABC = 36
    a04: S(36 / 2, 36 / 2, third(36 / 2)),
    // 교과서 221쪽 2 (1): AG = 10, EC = 6
    a05: S(2, 1, 10 / 2, 6, 6 * 2),
    // 교과서 221쪽 3 (1): △ABC = 30, 색칠 2칸
    a06: S(6, 30 / 6, 2, 2 * (30 / 6)),
    // 교과서 221쪽 4: AM = 36
    a07: S(third(36), third(36), twoThirds(third(36))),
    // 교과서 221쪽 5: EM = 9
    a08: S(9, 18, 18, twoThirds(18)),
    // 학습지 11쪽 두번째 1: △GBM = 2
    a09: S(6, 6 * 2),
  },
  2: {
    b01: S(6 * 4), // 교과서 220쪽 문제 2: △GAF = 4
    b02: S(third(21), twoThirds(21)), // 교과서 221쪽 2 (2): CD = 21
    b03: S((30 / 6) * 3), // 교과서 221쪽 3 (2)
    b04: S(12 + 12 / 2 + 8 / 2 + 8), // 교과서 221쪽 6: AB = AC = 12, BG = 8 (GC = GB)
    b05: S(26 / 2 + 14 / 2 + twoThirds(18)), // 교과서 230쪽 07: AC = 26, BG = 14, CE = 18
    b06: S(2 * ((36 / 2) / 6)), // 교과서 230쪽 10: □ABCD = 36
    b07: S(2 * ((36 / 3) / 2)), // 학습지 12쪽 점프 1: △ABC = 36
    b08: S(twoThirds(18) - 18 / 2), // 학습지 12쪽 점프 2: AD = 18
  },
};
// 학습지 12쪽 두번째 2: BD = 15 → BO = 15/2, EF = ⅓BD
solved[1].a10 = [fr(15, 2), '15', fr(15 / 3)];

let bad = 0;
const fail = (m) => { bad++; console.log('XX', m); };
for (const st of [1, 2]) {
  for (const id of Object.keys(ANSWERS[st])) {
    const got = solved[st][id] || [];
    const want = ANSWERS[st][id];
    const ok = got.length === want.length && got.every((v, i) => v === want[i]);
    console.log(ok ? 'OK ' : 'XX ', `${st}단계`, id, 'stored', want.join(', '), '| solved', got.join(', '));
    if (!ok) bad++;
    if (!EXPLAIN[id]) fail(`${id} 풀이 요약 없음`);
  }
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { window: {} };
vm.createContext(ctx);
for (const file of ['public/engine/render.js', 'public/units/centroid/problems.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx);
}
const W = ctx.window;
for (const st of [1, 2]) {
  const items = W.STAGES[st].items;
  const want = Object.keys(ANSWERS[st]);
  if (items.map((p) => p.id).join() !== want.join()) fail(`${st}단계 문항 목록 불일치`);
  for (const p of items) {
    const n = W.blankCount(p);
    if (n !== ANSWERS[st][p.id]?.length) fail(`${p.id} 빈칸 ${n}개, 정답 ${ANSWERS[st][p.id]?.length}개`);
    const svg = W.figureSvg(p.fig);
    if (!svg.startsWith('<svg') || /NaN|undefined/.test(svg)) fail(`${p.id} 그림 오류`);
  }
}
for (const p of W.STAGES[1].items) {
  if (FB_BLANKS[p.id]?.length !== ANSWERS[1][p.id].length) fail(`${p.id} 피드백 칸 수 불일치`);
}
const total = Object.keys(ANSWERS[1]).length + Object.keys(ANSWERS[2]).length;
console.log(bad ? `\n실패 ${bad}건` : `\n무게중심 전체 ${total}문항 일치, 빈칸 수·그림 확인 통과`);
process.exit(bad ? 1 : 0);
