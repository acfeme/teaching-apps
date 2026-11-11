import crypto from 'node:crypto';
import { validStudent } from './_lib.js';

// ---- 학생 로그인(반·번호 + 숫자 4자리 비밀번호) ----
// 사이트 저장소('site:')에 둔다
//   pin (hash)   `${반}:${번호}` → 'salt:scrypt해시' (비밀번호 원문은 저장하지 않음, 선생님도 볼 수 없음)
//   nick (hash)  `${반}:${번호}` → 별명 (랭킹에는 번호 대신 이 별명만 보인다)
//   nickrev (hash) 별명 → `${반}:${번호}` (같은 별명이 두 번 나오지 않게)
//   pinfail:{반}:{번호} → 틀린 횟수(5번 틀리면 5분 잠김)
// 로그인하면 서명된 표(token)를 주고, 학생 기록을 저장·조회하는 요청은 이 표가 그 반·번호와 맞아야 한다.

export const who = (cls, num) => `${cls}:${num}`;
const TOKEN_HOURS = 12;
const secret = () => `student-token-v1|${process.env.ADMIN_PASSWORD || ''}`;
const sign = (body) => crypto.createHmac('sha256', secret()).update(body).digest('base64url');

export function signToken(cls, num) {
  const body = `${cls}|${num}|${Date.now() + TOKEN_HOURS * 3600e3}`;
  return `${Buffer.from(body).toString('base64url')}.${sign(body)}`;
}

export function readToken(tok) {
  try {
    const [b, sig] = String(tok || '').split('.');
    if (!b || !sig) return null;
    const body = Buffer.from(b, 'base64url').toString();
    const want = sign(body);
    if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
    const [cls, n, exp] = body.split('|');
    if (!(Date.now() < Number(exp))) return null;
    const num = validStudent(cls, n);
    return num ? { cls, num } : null;
  } catch {
    return null;
  }
}

export const tokenOf = (req) => readToken(req.headers?.['x-student-token']);

// 학생 기록을 다루는 요청에서 부른다. 표가 없거나 다른 학생 것이면 401
export function requireStudent(req, res, cls, num) {
  const t = tokenOf(req);
  if (t && t.cls === cls && t.num === num) return true;
  res.status(401).json({ code: 'LOGIN', error: '비밀번호로 다시 들어와 주세요.' });
  return false;
}

// ---- 비밀번호 ----
export function hashPin(pin) {
  const salt = crypto.randomBytes(12).toString('base64url');
  return `${salt}:${crypto.scryptSync(String(pin), salt, 32).toString('base64url')}`;
}
export function checkPin(pin, stored) {
  const [salt, h] = String(stored || '').split(':');
  if (!salt || !h) return false;
  const a = crypto.scryptSync(String(pin), salt, 32);
  const b = Buffer.from(h, 'base64url');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export const validPin = (pin) => /^\d{4}$/.test(String(pin ?? ''));

// ---- 별명 ----
const ADJ = ['용감한', '반짝이는', '느긋한', '씩씩한', '상냥한', '날쌘', '똑똑한', '신나는', '든든한', '졸린',
  '배고픈', '수줍은', '명랑한', '당당한', '엉뚱한', '차분한', '활기찬', '다정한', '재빠른', '꼼꼼한',
  '유쾌한', '행복한', '궁금한', '빛나는', '단단한', '부지런한', '기운찬', '포근한', '쾌활한', '슬기로운',
  '용맹한', '산뜻한', '말랑한', '튼튼한', '눈부신', '침착한', '상큼한', '기특한', '멋진', '귀여운'];
const NOUN = ['평행선', '삼각형', '중점', '꼭짓점', '직각', '대각선', '무게중심', '선분', '사각형', '컴퍼스',
  '각도기', '닮음비', '비례식', '오각형', '반지름', '지름', '좌표', '화살표', '별똥별', '펭귄',
  '고양이', '여우', '수달', '판다', '돌고래', '부엉이', '다람쥐', '거북이', '토끼', '고래'];
const randomNick = () => `${ADJ[crypto.randomInt(ADJ.length)]} ${NOUN[crypto.randomInt(NOUN.length)]}`;

export async function assignNick(site, cls, num) {
  const w = who(cls, num);
  for (let i = 0; i < 40; i++) {
    const n = randomNick();
    // eslint-disable-next-line no-await-in-loop
    if (!(await site.hget('nickrev', n))) {
      // eslint-disable-next-line no-await-in-loop
      await site.hset('nickrev', { [n]: w });
      // eslint-disable-next-line no-await-in-loop
      await site.hset('nick', { [w]: n });
      return n;
    }
  }
  const n = `${randomNick()} ${crypto.randomInt(10, 100)}`;
  await site.hset('nickrev', { [n]: w });
  await site.hset('nick', { [w]: n });
  return n;
}

export async function nickOf(site, cls, num) {
  return (await site.hget('nick', who(cls, num))) || assignNick(site, cls, num);
}

// 랭킹에 나오는 학생들의 별명(없으면 지금 정해 준다). keys: ['2-1:5', ...] → {키: 별명}
export async function nicksFor(site, keys) {
  const uniq = [...new Set(keys)];
  if (!uniq.length) return {};
  const vals = await site.hmget('nick', ...uniq);
  const out = {};
  for (let i = 0; i < uniq.length; i++) {
    const [cls, n] = uniq[i].split(':');
    // eslint-disable-next-line no-await-in-loop
    out[uniq[i]] = vals[i] || (await assignNick(site, cls, Number(n)));
  }
  return out;
}

export async function releaseNick(site, cls, num) {
  const w = who(cls, num);
  const old = await site.hget('nick', w);
  if (old) await site.hdel('nickrev', old);
  await site.hdel('nick', w);
}
