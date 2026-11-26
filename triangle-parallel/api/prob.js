import crypto from 'node:crypto';
import { checkAdmin, noStore, readBody, store } from './_lib.js';
import { checkPin, hashPin, validPin } from './_auth.js';

// 중2 Ⅷ. 경우의 수와 확률 (모둠 수학 8단원) — 기록은 최소한만
// 문제 풀이와 진행 위치는 학생 기기(브라우저)에만 저장하고, 서버에는 '시작 / 1단계 완료 / 완료'와 이탈 횟수만 남긴다.
// 저장소 prefix 'prob:'
//   open (hash)        `${반}:${단원}` → '1' 열림 / '0' 잠김 (저장된 값이 없으면 8.1 수업만 열림)
//   rec:{단원} (hash)  `${반}:${번호}` → JSON {name, st, t, done, lv, paper}
//   pin (hash)         `${반}:${번호}` → 'salt:scrypt해시' (학생 비밀번호 숫자 4자리. 원문은 저장하지 않음)
//   pinfail:{반}:{번호} → 틀린 횟수 (5번 틀리면 5분 잠김)
// POST /api/prob {op:'login', cls, no, pw}  → { ok, token, pwNew }  (처음이면 비밀번호를 정함)
//   기록을 보내는 'rec' 은 이 token(헤더 x-prob-token)이 그 반·번호와 맞아야 받는다.
// POST /api/prob {op:'pwreset', cls, no} (관리자) → 비밀번호 초기화 (다음에 들어올 때 새로 정함)
//
// GET  /api/prob?op=open&cls=반                  → { open: {단원: true|false} }      (학생 단원 목록)
// POST /api/prob {op:'rec', ch, cls, no, name, st, lv}                            (학생: 진행 단계 알리기)
// GET  /api/prob?op=all&ch=단원        (관리자)  → { recs, open }
// POST /api/prob {op:'open', cls, ch, v} | {op:'paper', ch, id, v} | {op:'del', ch, id | cls}   (관리자)
export const PCLASSES = ['1반', '2반', '3반', '4반', 'A반', 'B반', 'C반'];
export const PCHS = ['8.1', 'P8.1', 'P8.2', 'P8.3', 'P8.4'];
const STEPS = ['start', 's1', 'done'];
const MAX_NO = 35;

const openDefault = (ch) => ch === '8.1';
const openOf = (raw, ch) => (raw == null ? openDefault(ch) : String(raw) === '1');
const okNo = (n) => Number.isInteger(Number(n)) && Number(n) >= 1 && Number(n) <= MAX_NO;
const parse = (v) => { try { return JSON.parse(v); } catch { return null; } };

// ---- 학생 로그인 표(token): 12시간 ----
const TOKEN_HOURS = 12;
const secret = () => `prob-token-v1|${process.env.ADMIN_PASSWORD || ''}`;
const sign = (body) => crypto.createHmac('sha256', secret()).update(body).digest('base64url');
function makeToken(cls, no) {
  const body = `${cls}|${no}|${Date.now() + TOKEN_HOURS * 3600e3}`;
  return `${Buffer.from(body).toString('base64url')}.${sign(body)}`;
}
function readToken(tok) {
  try {
    const [b, sig] = String(tok || '').split('.');
    if (!b || !sig) return null;
    const body = Buffer.from(b, 'base64url').toString();
    const want = sign(body);
    if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
    const [cls, no, exp] = body.split('|');
    if (!(Date.now() < Number(exp)) || !PCLASSES.includes(cls) || !okNo(no)) return null;
    return { cls, no: Number(no) };
  } catch {
    return null;
  }
}
const PIN_MAX_FAILS = 5;
const PIN_LOCK_SEC = 300;

async function openFor(s, cls) {
  const fields = PCHS.map((ch) => `${cls}:${ch}`);
  const vals = await s.hmget('open', ...fields);
  const o = {};
  PCHS.forEach((ch, i) => { o[ch] = openOf(vals[i], ch); });
  return o;
}
async function openAll(s) {
  const raw = await s.hgetall('open');
  const o = {};
  PCLASSES.forEach((c) => { o[c] = {}; PCHS.forEach((ch) => { o[c][ch] = openOf(raw[`${c}:${ch}`], ch); }); });
  return o;
}

export default async function handler(req, res) {
  noStore(res);
  const s = store('prob:');
  const site = store('site:');   // 관리자 비밀번호 틀린 횟수는 사이트 공통 저장소에서 센다
  if (!s || !site) return res.status(503).json({ error: '저장소가 아직 연결되지 않았습니다.' });
  try {
    if (req.method === 'GET') {
      const op = req.query?.op;
      if (op === 'open') {
        const cls = req.query?.cls;
        if (!PCLASSES.includes(cls)) return res.status(400).json({ error: '반이 올바르지 않습니다.' });
        return res.status(200).json({ open: await openFor(s, cls) });
      }
      if (op === 'all') {
        if (!(await checkAdmin(req, res, site))) return undefined;
        const ch = req.query?.ch;
        if (!PCHS.includes(ch)) return res.status(400).json({ error: '단원이 올바르지 않습니다.' });
        const raw = await s.hgetall(`rec:${ch}`);
        const recs = {};
        Object.keys(raw).forEach((k) => { const r = parse(raw[k]); if (r) recs[k] = r; });
        const pins = await s.hgetall('pin');
        return res.status(200).json({ recs, open: await openAll(s), pins: Object.fromEntries(Object.keys(pins).map((k) => [k, 1])) });
      }
      if (op === 'check') {
        if (!(await checkAdmin(req, res, site))) return undefined;
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ error: '요청이 올바르지 않습니다.' });
    }
    if (req.method === 'POST') {
      const b = readBody(req) || {};
      if (b.op === 'login') {
        const cls = b.cls, no = Number(b.no), pw = String(b.pw ?? '');
        if (!PCLASSES.includes(cls) || !okNo(no)) return res.status(400).json({ error: '반과 번호를 다시 골라 주세요.' });
        if (!validPin(pw)) return res.status(400).json({ error: '비밀번호는 숫자 4자리예요.' });
        const id = `${cls}:${no}`, fk = `pinfail:${id}`;
        if ((Number(await s.get(fk)) || 0) >= PIN_MAX_FAILS) return res.status(429).json({ error: '비밀번호를 여러 번 틀렸어요. 5분 뒤에 다시 하거나 선생님께 말해 주세요.' });
        const stored = await s.hget('pin', id);
        if (!stored) {
          await s.hset('pin', { [id]: hashPin(pw) });
          return res.status(200).json({ ok: true, token: makeToken(cls, no), pwNew: true });
        }
        if (!checkPin(pw, stored)) {
          await s.incrWithExpire(fk, PIN_LOCK_SEC);
          return res.status(401).json({ error: '비밀번호가 맞지 않아요. 잊어버렸으면 선생님께 말해 주세요.' });
        }
        await s.del(fk);
        return res.status(200).json({ ok: true, token: makeToken(cls, no), pwNew: false });
      }
      if (b.op === 'rec') {
        const { ch, cls } = b;
        const no = Number(b.no);
        const t = readToken(req.headers?.['x-prob-token']);
        if (!t || t.cls !== cls || t.no !== no) return res.status(401).json({ code: 'LOGIN', error: '비밀번호로 다시 들어와 주세요.' });
        const name = String(b.name || '').trim().slice(0, 20);
        if (!PCHS.includes(ch) || !PCLASSES.includes(cls) || !okNo(no) || !name || !STEPS.includes(b.st)) {
          return res.status(400).json({ error: '기록이 올바르지 않습니다.' });
        }
        const key = `rec:${ch}`, field = `${cls}:${no}`;
        const old = parse(await s.hget(key, field)) || {};
        const now = Date.now();
        // 단계는 뒤로 가지 않는다(다른 기기에서 처음부터 다시 해도 '완료'는 남는다)
        const st = STEPS.indexOf(b.st) >= STEPS.indexOf(old.st || 'start') ? b.st : old.st;
        const rec = {
          name, st, t: now,
          done: old.done || (st === 'done' ? now : null),
          lv: Math.max(Number(old.lv) || 0, Math.min(999, Math.max(0, Number(b.lv) || 0))),
          paper: !!old.paper,
        };
        await s.hset(key, { [field]: JSON.stringify(rec) });
        return res.status(200).json({ ok: true });
      }
      // ---- 관리자 ----
      if (!(await checkAdmin(req, res, site))) return undefined;
      if (b.op === 'open') {
        const list = b.cls === 'all' ? PCLASSES : PCLASSES.includes(b.cls) ? [b.cls] : null;
        if (!list || !PCHS.includes(b.ch)) return res.status(400).json({ error: '반 또는 단원이 올바르지 않습니다.' });
        await s.hset('open', Object.fromEntries(list.map((c) => [`${c}:${b.ch}`, b.v ? '1' : '0'])));
        return res.status(200).json({ ok: true, open: await openAll(s) });
      }
      if (b.op === 'pwreset') {
        if (!PCLASSES.includes(b.cls) || !okNo(b.no)) return res.status(400).json({ error: '반과 번호가 올바르지 않습니다.' });
        const id = `${b.cls}:${Number(b.no)}`;
        await s.hdel('pin', id);
        await s.del(`pinfail:${id}`);
        return res.status(200).json({ ok: true });
      }
      if (b.op === 'paper') {
        if (!PCHS.includes(b.ch)) return res.status(400).json({ error: '단원이 올바르지 않습니다.' });
        const key = `rec:${b.ch}`, old = parse(await s.hget(key, String(b.id)));
        if (!old) return res.status(404).json({ error: '기록이 없습니다.' });
        old.paper = !!b.v;
        await s.hset(key, { [String(b.id)]: JSON.stringify(old) });
        return res.status(200).json({ ok: true });
      }
      if (b.op === 'del') {
        if (!PCHS.includes(b.ch)) return res.status(400).json({ error: '단원이 올바르지 않습니다.' });
        const key = `rec:${b.ch}`;
        if (b.id) { await s.hdel(key, String(b.id)); return res.status(200).json({ ok: true }); }
        if (!PCLASSES.includes(b.cls)) return res.status(400).json({ error: '반이 올바르지 않습니다.' });
        const raw = await s.hgetall(key);
        const ids = Object.keys(raw).filter((k) => k.startsWith(`${b.cls}:`));
        if (ids.length) await s.hdel(key, ...ids);
        return res.status(200).json({ ok: true, n: ids.length });
      }
      return res.status(400).json({ error: '요청이 올바르지 않습니다.' });
    }
    return res.status(405).json({ error: '지원하지 않는 요청입니다.' });
  } catch (e) {
    console.error('prob failed', e);
    return res.status(502).json({ error: '처리하지 못했습니다. 다시 시도해 주세요.' });
  }
}
