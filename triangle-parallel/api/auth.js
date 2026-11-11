import { CLASSES, MAX_NUMBER, checkAdmin, noStore, readBody, store, validStudent } from './_lib.js';
import {
  assignNick, checkPin, hashPin, nickOf, releaseNick, signToken, validPin, who,
} from './_auth.js';

// 학생 로그인(반·번호 + 숫자 4자리 비밀번호)과 별명
// POST /api/auth {action:'check', cls, num}        → {hasPin, lockedSec}
// POST /api/auth {action:'login', cls, num, pin}   → 처음이면 비밀번호를 정하고, 아니면 확인 → {token, nick, created}
// GET  /api/auth?cls= (관리자)                     → 그 반 학생들의 별명·비밀번호 설정 여부·잠김
// POST /api/auth {action:'reset', cls, num} (관리자)  → 비밀번호 초기화(학생이 다음에 들어올 때 새로 정함)
// POST /api/auth {action:'renick', cls, num} (관리자) → 별명 다시 뽑기
const MAX_FAILS = 5;
const LOCK_SEC = 300;
const failKey = (cls, num) => `pinfail:${cls}:${num}`;

export default async function handler(req, res) {
  noStore(res);
  const site = store('site:');
  if (!site) return res.status(503).json({ error: '저장소가 아직 연결되지 않았습니다.' });
  try {
    if (req.method === 'GET') {
      if (!(await checkAdmin(req, res, site))) return undefined;
      const cls = req.query?.cls;
      if (!CLASSES.includes(cls)) return res.status(400).json({ error: '반이 올바르지 않습니다.' });
      const nums = Array.from({ length: MAX_NUMBER }, (_, i) => i + 1);
      const keys = nums.map((n) => who(cls, n));
      const [pins, nicks, fails] = await Promise.all([
        site.hmget('pin', ...keys), site.hmget('nick', ...keys), Promise.all(nums.map((n) => site.get(failKey(cls, n)))),
      ]);
      const students = nums.map((n, i) => ({ num: n, nick: nicks[i] || null, hasPin: !!pins[i], locked: Number(fails[i]) >= MAX_FAILS }))
        .filter((s) => s.nick || s.hasPin);
      return res.status(200).json({ cls, students });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: '지원하지 않는 요청입니다.' });

    const body = readBody(req) || {};
    const cls = body.cls;
    const num = validStudent(cls, body.num);
    if (!num) return res.status(400).json({ error: '반 또는 번호가 올바르지 않습니다.' });
    const w = who(cls, num);

    if (body.action === 'reset' || body.action === 'renick') {
      if (!(await checkAdmin(req, res, site))) return undefined;
      if (body.action === 'reset') {
        await site.hdel('pin', w);
        await site.del(failKey(cls, num));
        return res.status(200).json({ ok: true });
      }
      await releaseNick(site, cls, num);
      return res.status(200).json({ ok: true, nick: await assignNick(site, cls, num) });
    }

    const fails = Number(await site.get(failKey(cls, num))) || 0;
    if (fails >= MAX_FAILS) {
      return res.status(429).json({ code: 'LOCKED', error: '비밀번호를 5번 틀려서 5분 동안 잠겼어요. 잊어버렸다면 선생님께 초기화를 부탁해요.' });
    }
    const stored = await site.hget('pin', w);

    if (body.action === 'check') return res.status(200).json({ hasPin: !!stored });

    if (body.action === 'login') {
      if (!validPin(body.pin)) return res.status(400).json({ error: '비밀번호는 숫자 4자리예요.' });
      if (!stored) {
        await site.hset('pin', { [w]: hashPin(body.pin) });
        const nick = await nickOf(site, cls, num);
        return res.status(200).json({ token: signToken(cls, num), nick, created: true });
      }
      if (!checkPin(body.pin, stored)) {
        const n = await site.incrWithExpire(failKey(cls, num), LOCK_SEC);
        const left = Math.max(0, MAX_FAILS - n);
        return res.status(401).json({ code: 'WRONG_PIN', left, error: left ? `비밀번호가 달라요. (남은 기회 ${left}번)` : '비밀번호를 5번 틀려서 5분 동안 잠겼어요. 잊어버렸다면 선생님께 초기화를 부탁해요.' });
      }
      if (fails > 0) await site.del(failKey(cls, num));
      return res.status(200).json({ token: signToken(cls, num), nick: await nickOf(site, cls, num), created: false });
    }
    return res.status(400).json({ error: '알 수 없는 요청입니다.' });
  } catch (e) {
    console.error('auth failed', e);
    return res.status(502).json({ error: '잠시 후 다시 시도해 주세요.' });
  }
}
