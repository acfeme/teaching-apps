import { CLASSES, checkAdmin, noStore, readBody, store } from './_lib.js';
import { MATERIALS } from './_units.js';

// 수업 자료(도형의 닮음, 직각삼각형의 닮음) 반별 열림·닫힘
// GET  /api/material                → { open: { 자료: { 반: true|false } } } (허브 카드 표시용)
// GET  /api/material?id=&cls=       → { open } (자료 화면의 잠금 확인. 관리자 비밀번호가 맞으면 늘 열림)
// GET  /api/material?check=1 (관리자) → 비밀번호 확인
// POST /api/material {id, cls, value} (관리자)
const field = (id, cls) => `mat:${id}:${cls}`;
const FIELDS = MATERIALS.flatMap((id) => CLASSES.map((c) => field(id, c)));

async function readAll(s) {
  const vals = await s.hmget('state', ...FIELDS);
  const out = {};
  MATERIALS.forEach((id) => { out[id] = {}; CLASSES.forEach((c) => { out[id][c] = String(vals[FIELDS.indexOf(field(id, c))] ?? '0') === '1'; }); });
  return out;
}

export default async function handler(req, res) {
  noStore(res);
  const s = store('site:');
  if (!s) return res.status(503).json({ error: '저장소가 아직 연결되지 않았습니다.' });
  try {
    if (req.method === 'GET') {
      if (req.query?.check) {
        if (!(await checkAdmin(req, res, s))) return undefined;
        return res.status(200).json({ ok: true, open: await readAll(s) });
      }
      const id = req.query?.id;
      if (!id) return res.status(200).json({ open: await readAll(s) });
      if (!MATERIALS.includes(id)) return res.status(404).json({ error: '없는 자료입니다.' });
      if (req.headers['x-admin-password']) {
        // 선생님 화면에서 열면 반과 상관없이 볼 수 있다(비밀번호가 틀리면 학생과 같게 처리)
        if (await checkAdmin(req, { status: () => ({ json: () => null }) }, s)) return res.status(200).json({ open: true, teacher: true });
      }
      const cls = req.query?.cls;
      if (!CLASSES.includes(cls)) return res.status(400).json({ error: '반이 올바르지 않습니다.' });
      return res.status(200).json({ open: String((await s.hget('state', field(id, cls))) ?? '0') === '1' });
    }
    if (req.method === 'POST') {
      if (!(await checkAdmin(req, res, s))) return undefined;
      const b = readBody(req) || {};
      if (!MATERIALS.includes(b.id)) return res.status(400).json({ error: '자료가 올바르지 않습니다.' });
      const list = b.cls === 'all' ? CLASSES : CLASSES.includes(b.cls) ? [b.cls] : null;
      if (!list) return res.status(400).json({ error: '반이 올바르지 않습니다.' });
      await s.hset('state', Object.fromEntries(list.map((c) => [field(b.id, c), b.value ? '1' : '0'])));
      return res.status(200).json({ ok: true, open: await readAll(s) });
    }
    return res.status(405).json({ error: '지원하지 않는 요청입니다.' });
  } catch (e) {
    console.error('material failed', e);
    return res.status(502).json({ error: '처리하지 못했습니다. 다시 시도해 주세요.' });
  }
}
