import { CLASSES, noStore, readBody, store, todayKST } from './_lib.js';
import { nicksFor, tokenOf } from './_auth.js';

// 게임 기록과 랭킹. 학생은 로그인 표(x-student-token)로 구분하고, 랭킹에는 번호 대신 별명만 보낸다.
// POST /api/game {game, value}     → 기록 저장 후 랭킹 (로그인 필요)
// GET  /api/game?game=&cls=         → 우리 반 오늘 상위 5명, 전체 누적(최고 기록) 상위 10명 (+ 로그인했으면 내 기록)
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
  // num이 없으면(로그인 안 함) 내 기록은 비워 둔다
  const G = GAMES[game];
  const date = todayKST();
  const [all, day, plays] = await Promise.all([s.hgetall(bestKey(game)), s.hgetall(dayKey(game, date)), num ? s.hget(playKey(game), who(cls, num)) : null]);
  const overall = ranked(G, all);
  const classToday = ranked(G, day, (r) => r.cls === cls);
  const me = (list) => (num ? list.find((r) => r.cls === cls && r.num === num) || null : null);
  const ct = classToday.slice(0, CLASS_TOP), ov = overall.slice(0, ALL_TOP);
  const nicks = await nicksFor(s, [...ct, ...ov].map((r) => who(r.cls, r.num)));
  const pub = (r) => ({ rank: r.rank, cls: r.cls, nick: nicks[who(r.cls, r.num)] || '익명', value: r.value, me: !!num && r.cls === cls && r.num === num });
  return {
    game, unit: G.unit, better: G.better, date,
    me: num ? { best: me(overall)?.value ?? null, today: me(classToday)?.value ?? null, overallRank: me(overall)?.rank ?? null, classRank: me(classToday)?.rank ?? null, plays: Number(plays) || 0 } : null,
    classToday: ct.map(pub),
    overall: ov.map(pub),
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
    if (!G) return res.status(400).json({ error: '게임이 올바르지 않습니다.' });
    const t = tokenOf(req);

    if (req.method === 'GET') {
      const cls = t ? t.cls : src.cls;
      if (!CLASSES.includes(cls)) return res.status(400).json({ error: '반이 올바르지 않습니다.' });
      return res.status(200).json(await view(s, game, cls, t ? t.num : null));
    }
    if (req.method !== 'POST') return res.status(405).json({ error: '지원하지 않는 요청입니다.' });
    if (!t) return res.status(401).json({ code: 'LOGIN', error: '비밀번호로 다시 들어와 주세요.' });
    const { cls, num } = t;

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
