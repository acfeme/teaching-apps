import { checkAdmin, noStore, readBody, store } from './_lib.js';

// 중2 Ⅷ. 경우의 수와 확률 (모둠 수학 8단원) — 기록은 최소한만
// 문제 풀이와 진행 위치는 학생 기기(브라우저)에만 저장하고, 서버에는 '시작 / 1단계 완료 / 완료'와 이탈 횟수만 남긴다.
// 저장소 prefix 'prob:'
//   open (hash)        `${반}:${단원}` → '1' 열림 / '0' 잠김 (저장된 값이 없으면 8.1 수업만 열림)
//   rec:{단원} (hash)  `${반}:${번호}` → JSON {name, st, t, done, lv, paper}
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
        return res.status(200).json({ recs, open: await openAll(s) });
      }
      if (op === 'check') {
        if (!(await checkAdmin(req, res, site))) return undefined;
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ error: '요청이 올바르지 않습니다.' });
    }
    if (req.method === 'POST') {
      const b = readBody(req) || {};
      if (b.op === 'rec') {
        const { ch, cls } = b;
        const no = Number(b.no);
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
