import {
  CLASSES, MAX_NUMBER, attField, checkAdmin, fbField, gameApplesOf, gardenField, gardenOf, noStore, readBody, store, validStudent,
} from './_lib.js';
import { requireStudent } from './_auth.js';
import { UNITS } from './_units.js';

// 내 보관함(모든 문제풀이 유닛의 사과나무와 수확한 사과)
// GET  /api/garden?cls=&num=          → 학생 한 명의 유닛별 나무·사과
// POST /api/garden {cls, num, unit}    → 그 유닛에 열린 사과 수확
// GET  /api/garden?cls=&all=1 (관리자) → 반 학생 전체 현황
export default async function handler(req, res) {
  noStore(res);
  const site = store('site:');
  if (!site) return res.status(503).json({ error: '저장소가 아직 연결되지 않았습니다.' });
  try {
    if (req.method === 'GET' && req.query?.all) {
      if (!(await checkAdmin(req, res, site))) return undefined;
      const cls = req.query.cls;
      if (!CLASSES.includes(cls)) return res.status(400).json({ error: '반이 올바르지 않습니다.' });
      return res.status(200).json(await classView(cls));
    }
    if (req.method === 'GET') {
      const cls = req.query?.cls;
      const num = validStudent(cls, req.query?.num);
      if (!num) return res.status(400).json({ error: '반 또는 번호가 올바르지 않습니다.' });
      if (!requireStudent(req, res, cls, num)) return undefined;
      return res.status(200).json(await studentView(cls, num));
    }
    if (req.method === 'POST') {
      const body = readBody(req) || {};
      const num = validStudent(body.cls, body.num);
      const U = UNITS[String(body.unit || '')];
      if (!num || !U) return res.status(400).json({ error: '반, 번호, 유닛이 올바르지 않습니다.' });
      if (!requireStudent(req, res, body.cls, num)) return undefined;
      const s = store(U.prefix);
      const g = await unitGarden(s, U, body.cls, num);
      if (g.ready <= 0) return res.status(409).json({ error: '아직 수확할 사과가 없어요.' });
      await s.hset('state', { [gardenField(body.cls, num)]: JSON.stringify({ harvested: g.ripe, at: Date.now() }) });
      return res.status(200).json({ picked: g.ready, ...(await studentView(body.cls, num)) });
    }
    return res.status(405).json({ error: '지원하지 않는 요청입니다.' });
  } catch (e) {
    console.error('garden failed', e);
    return res.status(502).json({ error: '보관함을 불러오지 못했어요. 다시 눌러 주세요.' });
  }
}

async function unitGarden(s, U, cls, num) {
  const vals = await s.hmget('state', ...U.STAGES.map((st) => attField(cls, num, st)), fbField(cls, num), gardenField(cls, num));
  return gardenOf(U, vals.slice(0, U.STAGES.length), vals[U.STAGES.length], vals[U.STAGES.length + 1]);
}

async function studentView(cls, num) {
  const units = await Promise.all(Object.values(UNITS).map(async (U) => ({ id: U.id, title: U.title, ...(await unitGarden(store(U.prefix), U, cls, num)) })));
  const game = await gameApplesOf(store('site:'), cls, num); // 게임에서 주운 사과(바로 바구니로)
  return { cls, num, units, game, basket: units.reduce((t, u) => t + u.harvested, 0) + game };
}

async function classView(cls) {
  const all = await Promise.all(Object.values(UNITS).map(async (U) => [U, await store(U.prefix).hgetall('state')]));
  const gap = (await store('site:').hgetall('gapple')) || {};
  const students = [];
  for (let num = 1; num <= MAX_NUMBER; num++) {
    const units = {};
    let any = false;
    for (const [U, h] of all) {
      const g = gardenOf(U, U.STAGES.map((st) => h[attField(cls, num, st)]), h[fbField(cls, num)], h[gardenField(cls, num)]);
      if (g.n || g.fbDone || g.harvested) any = true;
      units[U.id] = g;
    }
    const game = Number(gap[`${cls}:${num}`]) || 0;
    if (game) any = true;
    if (any) students.push({ num, units, game, basket: Object.values(units).reduce((t, g) => t + g.harvested, 0) + game });
  }
  return { cls, units: Object.values(UNITS).map((U) => ({ id: U.id, title: U.title, max: U.MAX })), students };
}
