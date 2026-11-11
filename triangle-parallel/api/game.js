import { CLASSES, noStore, readBody, store, todayKST, validStudent } from './_lib.js';

// 게임 기록과 랭킹(학생은 반·번호로 구분)
// POST /api/game {game, cls, num, value}   → 기록 저장 후 랭킹
// GET  /api/game?game=&cls=&num=           → 내 기록, 우리 반 오늘 상위 5명, 전체 누적(최고 기록) 상위 10명
// 짝맞추기는 걸린 시간(초, 짧을수록 좋음), 닮음 조건 쏘기는 점수(클수록 좋음)
const GAMES = {
  match: { better: 'low', min: 3, max: 3600, unit: '초' },
  shoot: { better: 'high', min: 0, max: 5000, unit: '점' },
  right: { better: 'high', min: 0, max: 20000, unit: '점' },
};
const CLASS_TOP = 5;
const ALL_TOP = 10;

const bestKey = (g) => `g:${g}:best`;
const dayKey = (g, date) => `g:${g}:day:${date}`;
const playKey = (g) => `g:${g}:plays`;
const who = (cls, num) => `${cls}:${num}`;

function isBetter(G, a, b) {
  if (b == null || Number.isNaN(b)) return true;
  return G.better === 'low' ? a < b : a > b;
}
function ranked(G, hash, filter) {
  const rows = Object.entries(hash || {}).map(([k, v]) => {
    const [cls, num] = k.split(':');
    return { cls, num: Number(num), value: Number(v) };
  }).filter((r) => CLASSES.includes(r.cls) && Number.isFinite(r.value) && (!filter || filter(r)));
  rows.sort((x, y) => (G.better === 'low' ? x.value - y.value : y.value - x.value) || x.cls.localeCompare(y.cls) || x.num - y.num);
  // 같은 기록은 같은 등수
  let rank = 0, prev = null;
  rows.forEach((r, i) => { if (r.value !== prev) { rank = i + 1; prev = r.value; } r.rank = rank; });
  return rows;
}

async function view(s, game, cls, num) {
  const G = GAMES[game];
  const date = todayKST();
  const [all, day, plays] = await Promise.all([s.hgetall(bestKey(game)), s.hgetall(dayKey(game, date)), s.hget(playKey(game), who(cls, num))]);
  const overall = ranked(G, all);
  const classToday = ranked(G, day, (r) => r.cls === cls);
  const me = (list) => list.find((r) => r.cls === cls && r.num === num) || null;
  return {
    game, unit: G.unit, better: G.better, date,
    me: { best: me(overall)?.value ?? null, today: me(classToday)?.value ?? null, overallRank: me(overall)?.rank ?? null, classRank: me(classToday)?.rank ?? null, plays: Number(plays) || 0 },
    classToday: classToday.slice(0, CLASS_TOP),
    overall: overall.slice(0, ALL_TOP),
  };
}

export default async function handler(req, res) {
  noStore(res);
  const s = store('site:');
  if (!s) return res.status(503).json({ error: '저장소가 아직 연결되지 않았습니다.' });
  try {
    const src = req.method === 'POST' ? readBody(req) || {} : req.query || {};
    const game = String(src.game || '');
    const G = GAMES[game];
    const num = validStudent(src.cls, src.num);
    if (!G || !num) return res.status(400).json({ error: '게임, 반, 번호가 올바르지 않습니다.' });
    const cls = src.cls;

    if (req.method === 'GET') return res.status(200).json(await view(s, game, cls, num));
    if (req.method !== 'POST') return res.status(405).json({ error: '지원하지 않는 요청입니다.' });

    const value = Math.round(Number(src.value) * 10) / 10;
    if (!Number.isFinite(value) || value < G.min || value > G.max) return res.status(400).json({ error: '기록이 올바르지 않습니다.' });
    const date = todayKST();
    const k = who(cls, num);
    const [best, today] = await s.hmget(bestKey(game), k).then(async (b) => [b[0], (await s.hmget(dayKey(game, date), k))[0]]);
    const newBest = isBetter(G, value, best == null ? null : Number(best));
    const writes = [s.hincr(playKey(game), k)];
    if (newBest) writes.push(s.hset(bestKey(game), { [k]: String(value) }));
    if (isBetter(G, value, today == null ? null : Number(today))) writes.push(s.hset(dayKey(game, date), { [k]: String(value) }));
    await Promise.all(writes);
    return res.status(200).json({ saved: value, newBest, ...(await view(s, game, cls, num)) });
  } catch (e) {
    console.error('game failed', e);
    return res.status(502).json({ error: '기록을 저장하지 못했어요. 다시 시도해 주세요.' });
  }
}
