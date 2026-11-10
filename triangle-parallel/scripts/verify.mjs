// 교과서·학습지 원문의 수치만으로 정답을 다시 계산해 api/_unit-triangle-parallel.js와 대조하고,
// 학생 화면 문제 파일(public/problems.js)의 문항·빈칸 수가 정답과 맞는지 확인한다.
// 실행: node scripts/verify.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANSWERS, EXPLAIN, FB_BLANKS, FB_MID, FB_MID_COUNT } from '../api/_unit-triangle-parallel.js';
import { parseNumber, sameValue } from '../api/_grade.js';

const gcd = (a, b) => (b === 0n ? (a < 0n ? -a : a) : gcd(b, a % b));
class F {
  constructor(n, d = 1n) {
    n = BigInt(n); d = BigInt(d);
    const g = gcd(n, d) || 1n;
    this.n = n / g; this.d = d / g;
    if (this.d < 0n) { this.n = -this.n; this.d = -this.d; }
  }
  add(o) { o = f(o); return new F(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { o = f(o); return new F(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { o = f(o); return new F(this.n * o.n, this.d * o.d); }
  div(o) { o = f(o); return new F(this.n * o.d, this.d * o.n); }
  toString() { return this.d === 1n ? `${this.n}` : `${this.n}/${this.d}`; }
}
const f = (v) => (v instanceof F ? v : new F(v));
// a : b = c : ?  →  ? = b·c/a
const prop = (a, b, c) => f(b).mul(c).div(a);
const S = (...v) => v.map(String);

const solved = {
  1: {
    // 교과서 213쪽 예제 1 (1): AD=8, AB=12, DE=10, AE=12
    a01: S(10, 'x', prop(8, 12, 10), 12, 'y', prop(8, 12, 12)),
    // 교과서 213쪽 예제 1 (2): AB=4, AD=8, CE=9, DE=10. AC:AE=1:2
    a02: S(1, 2, f(9).mul(2).div(3), 'y', 10, prop(8, 4, 10)),
    // 교과서 214쪽 문제 1 (1): AC=8, AE=6, DE=9, AB=10
    a03: S('x', 9, prop(6, 8, 9), 10, 'y', prop(8, 6, 10)),
    // 교과서 214쪽 문제 1 (2): AE=9, EC=3, BC=12, AB=8
    a04: S(f(9).add(3), 'x', prop(12, 9, 12), prop(12, 9, 8), f(8).sub(prop(12, 9, 8))),
    // 교과서 217쪽 1 (1): AB=12, AC=21, EC=7, DE=12
    a05: S(f(21).sub(7), 21, 14, prop(21, 12, 14), 'y', 12, prop(14, 21, 12)),
    // 학습지 7쪽 1 (2): AB=4, BD=6, DE=9
    a06: S(f(4).add(6), 10, 'x', prop(10, 4, 9)),
    // 교과서 214쪽 문제 2 (2): MN=7
    a07: S(7, f(7).mul(2)),
    // 학습지 7쪽 2: PN=3, BC=10
    a08: S(3, f(3).mul(2), 10, f(10).div(2)),
    // 교과서 215쪽 예제 3 (1): 10:4=x:6
    a09: S('x', 6, prop(4, 10, 6)),
    // 교과서 215쪽 예제 3 (2): 6:(x-6)=4:10
    a10: S(4, 10, prop(4, 6, 10).add(6)),
  },
  2: {
    // 교과서 217쪽 1 (2): BC=6, DE=4, BD=15 → AD:AB=2:3
    b01: S(f(15).mul(2).div(5), f(15).mul(3).div(5)),
    // 학습지 7쪽 1 (3): AB=6, AD=10, AE=5, x=CE=AC+AE
    b02: S(prop(10, 6, 5).add(5)),
    // 교과서 217쪽 4: AB=5, AC=7, BC=8
    b03: S(f(5).add(7).add(8).div(2)),
    // 교과서 230쪽 06: AC=30, BD=36
    b04: S(f(30).add(36)),
    // 학습지 8쪽 2: BF=14 → BG=GF=FC
    b05: S(f(14).div(2)),
    // 학습지 9쪽 3: AC=10, BD=8
    b06: S(f(10).add(8)),
    // 교과서 216쪽 문제 3 (1): 5:10=x:6
    b07: S(prop(10, 5, 6)),
    // 교과서 217쪽 3: AC=9, CE=6, BD=10
    b08: S(prop(9, 6, 10)),
    // 교과서 217쪽 6 (3): AB=14, DC=35
    b09: S(f(14).mul(35).div(f(14).add(35))),
    // 교과서 230쪽 09: AD=10, BC=20, AE=6, EB=9
    b10: S(prop(15, 6, 20).add(prop(15, 9, 10))),
  },
};

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

// 학생 화면 문제 파일과 대조
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { window: {} };
vm.createContext(ctx);
// 공통 그리기 엔진 + 유닛 데이터(문제·그림)를 화면과 같은 순서로 불러온다
for (const file of ['public/engine/render.js', 'public/units/triangle-parallel/problems.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx);
}
const W = ctx.window;
for (const st of [1, 2]) {
  const items = W.STAGES[st].items;
  const ids = items.map((p) => p.id);
  const want = Object.keys(ANSWERS[st]);
  if (ids.join() !== want.join()) fail(`${st}단계 문항 목록 불일치 ${ids} / ${want}`);
  for (const p of items) {
    const n = W.blankCount(p);
    if (n !== ANSWERS[st][p.id]?.length) fail(`${p.id} 빈칸 ${n}개, 정답 ${ANSWERS[st][p.id]?.length}개`);
    if (!W.figureSvg(p.fig).startsWith('<svg')) fail(`${p.id} 그림 없음`);
  }
}

// 피드백 문제(비례식만): 화면의 fbSteps 칸 위치 = 서버 FB_BLANKS, 숨긴 단계는 계산 칸뿐인지
for (const p of W.STAGES[1].items) {
  const idx = FB_BLANKS[p.id];
  if (!p.fbSteps !== !idx) { fail(`${p.id} 피드백 문제 설정이 화면·서버 중 한쪽에만 있음`); continue; }
  if (!idx) continue;
  const starts = [];
  let k = 0;
  p.steps.forEach((step) => { starts.push(k); k += step.eq.split('@').length - 1; });
  const expect = p.fbSteps.flatMap((i) => {
    const cnt = p.steps[i].eq.split('@').length - 1;
    return Array.from({ length: cnt }, (_, j) => starts[i] + j);
  });
  if (expect.join() !== idx.join()) fail(`${p.id} 피드백 칸 위치 화면 ${expect} / 서버 ${idx}`);
  if (!FB_MID.includes(p.id) && !p.fbSteps.some((i) => p.steps[i].eq.includes(':'))) fail(`${p.id} 피드백 문제에 비례식이 없음`);
}
if (!FB_MID.every((id) => FB_BLANKS[id]) || FB_MID.length < FB_MID_COUNT) fail('중점 연결 피드백 문제 설정 오류');
if (Object.keys(FB_BLANKS).length - FB_MID.length < 5 - FB_MID_COUNT) fail('비례식 피드백 문제가 모자람');
console.log('피드백 문제(비례식만):', Object.entries(FB_BLANKS).map(([id, ix]) => `${id} ${ix.map((i) => ANSWERS[1][id][i]).join(',')}`).join(' | '));

// 답 입력 형식 시험
const cases = [
  ['3.6', '18/5', true], ['18/5', '18/5', true], ['36/10', '18/5', true],
  ['7.50', '15/2', true], ['15', '15', true], ['15.0', '15', true],
  ['6.67', '20/3', false], ['20/3', '20/3', true], ['1/0', '1', false],
  ['', '1', false], ['abc', '1', false], ['1.2.3', '1', false], ['.5', '1/2', true], ['5.', '5', false],
];
for (const [input, ans, want] of cases) {
  if (sameValue(input, ans) !== want) fail(`input ${JSON.stringify(input)} ${ans}`);
}
if (parseNumber('1/0') !== null) fail('zero denominator');

const total = Object.keys(ANSWERS[1]).length + Object.keys(ANSWERS[2]).length;
console.log(bad ? `\n실패 ${bad}건` : `\n전체 ${total}문항 일치, 빈칸 수·입력 형식 시험 통과`);
process.exit(bad ? 1 : 0);
