// 교과서·학습지 원문의 수치만으로 정답을 다시 계산해 api/_answers.js와 대조한다.
// 실행: node scripts/verify.mjs
import { ANSWERS } from '../api/_answers.js';
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

const solved = {
  // 교과서 213쪽 예제 1 (1): AB=12, AD=8, AE=12, DE=10
  p01: [prop(8, 12, 10), prop(8, 12, 12)],
  // 교과서 213쪽 예제 1 (2): AB=4, AD=8, CE=9, DE=10. AC:AE=1:2, AC+AE=9
  p02: [f(9).mul(2).div(3), prop(8, 4, 10)],
  // 교과서 214쪽 문제 1 (1): AB=10, AC=8, AE=6, DE=9
  p03: [prop(6, 8, 9), prop(8, 6, 10)],
  // 교과서 214쪽 문제 1 (2): AB=8, AE=9, EC=3, BC=12
  p04: [prop(12, 9, 12), f(8).sub(prop(12, 9, 8))],
  // 교과서 217쪽 1 (1): AB=12, AC=21, EC=7, DE=12
  p05: [prop(21, 12, f(21).sub(7)), prop(f(21).sub(7), 21, 12)],
  // 교과서 217쪽 1 (2): BC=6, DE=4, BD=15. AB:AD=3:2
  p06: [f(15).mul(2).div(5), f(15).mul(3).div(5)],
  // 학습지 7쪽 1 (1): AD=6, AE=8, EC=4 → AD:DB=AE:EC
  p07: [prop(8, 6, 4)],
  // 학습지 7쪽 1 (2): AB=4, BD=6, DE=9
  p08: [prop(f(4).add(6), 4, 9)],
  // 학습지 7쪽 1 (3): AB=6, AD=10, AE=5, x=CE=AC+AE
  p09: [prop(10, 6, 5).add(5)],
  // 교과서 214쪽 문제 2 (2): MN=7, BC=2MN
  p10: [f(7).mul(2)],
  // 교과서 217쪽 4: AB=5, AC=7, BC=8
  p11: [f(5).add(7).add(8).div(2)],
  // 교과서 230쪽 06: AC=30, BD=36 → 둘레=AC+BD
  p12: [f(30).add(36)],
  // 학습지 7쪽 2: PN=3 → AD=6, BC=10 → MP=5
  p13: [f(3).mul(2), f(10).div(2)],
  // 학습지 8쪽 2: A를 지나고 DF에 평행한 직선과 BC의 교점 G → BG=GF=FC
  p14: [f(14).div(2)],
  // 학습지 9쪽 1: BC=8, CA=4
  p15: [f(8).div(2), f(4).div(2)],
  // 학습지 9쪽 3: AC=10, BD=8 → 둘레=AC+BD
  p16: [f(10).add(8)],
  // 교과서 215쪽 예제 3 (1): 10:4=x:6
  p17: [prop(4, 10, 6)],
  // 교과서 215쪽 예제 3 (2): 6:(x-6)=4:10
  p18: [prop(4, 6, 10).add(6)],
  // 교과서 216쪽 문제 3 (1): 5:10=x:6
  p19: [prop(10, 5, 6)],
  // 교과서 216쪽 문제 3 (2): 6:3=8:(x-8)
  p20: [prop(6, 3, 8).add(8)],
  // 교과서 217쪽 3: AC=9, CE=6, BD=10
  p21: [prop(9, 6, 10)],
  // 교과서 217쪽 5: 20:15=12:x, 20:15=y:12
  p22: [prop(20, 15, 12).add(prop(15, 20, 12))],
  // 교과서 217쪽 6 (3): AB=14, DC=35 → EF=AB·DC/(AB+DC)
  p23: [f(14).mul(35).div(f(14).add(35))],
  // 교과서 230쪽 09: AD=10, BC=20, AE=6, EB=9 → EG+GF
  p24: [prop(f(6).add(9), 6, 20).add(prop(f(6).add(9), 9, 10))],
  // 학습지 9쪽 2: 5:4=8:x, 5:4=y:3
  p25: [prop(5, 4, 8).mul(prop(4, 5, 3))],
};

let bad = 0;
for (const id of Object.keys(ANSWERS)) {
  const got = (solved[id] || []).map(String);
  const want = ANSWERS[id];
  const ok = got.length === want.length && got.every((v, i) => v === want[i]);
  if (!ok) bad++;
  console.log(ok ? 'OK ' : 'XX ', id, 'stored', want.join(', '), '| solved', got.join(', '));
}

// 답 입력 형식 시험
const cases = [
  ['3.6', '18/5', true], ['18/5', '18/5', true], ['36/10', '18/5', true],
  ['7.50', '15/2', true], ['15', '15', true], ['15.0', '15', true],
  ['6.67', '20/3', false], ['20/3', '20/3', true], ['1/0', '1', false],
  ['', '1', false], ['abc', '1', false], ['1.2.3', '1', false], ['.5', '1/2', true], ['5.', '5', false],
];
for (const [input, ans, want] of cases) {
  const got = sameValue(input, ans);
  if (got !== want) { bad++; console.log('XX input', JSON.stringify(input), ans, got); }
}
if (parseNumber('1/0') !== null) { bad++; console.log('XX zero denominator'); }

console.log(bad ? `\n실패 ${bad}건` : `\n전체 ${Object.keys(ANSWERS).length}문항 일치, 입력 형식 시험 통과`);
process.exit(bad ? 1 : 0);
