// 소수·분수 답을 정확한 유리수로 비교한다. (예: 3.6 = 18/5)
export function parseNumber(raw) {
  const s = String(raw ?? '').trim();
  let m = /^(\d+)\/(\d+)$/.exec(s);
  if (m) {
    const d = BigInt(m[2]);
    return d === 0n ? null : { n: BigInt(m[1]), d };
  }
  m = /^(\d*)\.(\d+)$/.exec(s);
  if (m) return { n: BigInt((m[1] || '0') + m[2]), d: 10n ** BigInt(m[2].length) };
  if (/^\d+$/.test(s)) return { n: BigInt(s), d: 1n };
  return null;
}

export function sameValue(input, answer) {
  const a = parseNumber(input);
  const b = parseNumber(answer);
  if (!a || !b) return false;
  return a.n * b.d === b.n * a.d;
}
