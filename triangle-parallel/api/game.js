import { CLASSES, giveGameApples, noStore, readBody, sameGroup, store, todayKST } from './_lib.js';
import { nicksFor, tokenOf } from './_auth.js';
import { dungeon, parseJson, towerToday } from './_dungeon.js';

// 게임 기록과 랭킹. 학생은 로그인 표(x-student-token)로 구분하고, 랭킹에는 번호 대신 별명만 보낸다.
// POST /api/game {game, value}     → 기록 저장 후 랭킹 (로그인 필요)
// GET  /api/game?game=&cls=         → 우리 반 오늘 상위 5명, 전체 누적(최고 기록) 상위 10명 (+ 로그인했으면 내 기록)
// 짝맞추기는 걸린 시간(초, 짧을수록 좋음), 나머지는 점수(클수록 좋음)
// 평행선 던전 탐험의 캐릭터·가방·상자·상점: GET ?game=dungeon&profile=1, POST {game:'dungeon', action} (api/_dungeon.js)
// GET ?game=dungeon&tower=1 → 오늘 반별 탑 높이(로그인 없이)
const GAMES = {
  match: { better: 'low', min: 3, max: 3600, unit: '초' },
  shoot: { better: 'high', min: 0, max: 5000, unit: '점' },
  right: { better: 'high', min: 0, max: 20000, unit: '점' },
  dungeon: { better: 'high', min: 0, max: 30000, unit: '점' },
  cspeed: { better: 'low', min: 10, max: 7200, unit: '초' }, // 무게중심 스피드 퀴즈: 20문제 시간 + 틀림 벌점
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
  // 전체 순위는 우리 반끼리, 샘플반(체험)끼리 따로
  const overall = ranked(G, all, (r) => sameGroup(r.cls, cls));
  const classToday = ranked(G, day, (r) => r.cls === cls);
  const me = (list) => (num ? list.find((r) => r.cls === cls && r.num === num) || null : null);
  const ct = classToday.slice(0, CLASS_TOP), ov = overall.slice(0, ALL_TOP);
  const keys = [...ct, ...ov].map((r) => who(r.cls, r.num));
  const nicks = await nicksFor(s, keys);
  const uniq = [...new Set(keys)];
  const avs = uniq.length ? await s.hmget('avatar', ...uniq) : [];
  const av = Object.fromEntries(uniq.map((k, i) => [k, parseJson(avs[i])]));
  const pub = (r) => ({ rank: r.rank, cls: r.cls, nick: nicks[who(r.cls, r.num)] || '익명', av: av[who(r.cls, r.num)] || null, value: r.value, me: !!num && r.cls === cls && r.num === num });
  return {
    game, unit: G.unit, better: G.better, date,
    me: num ? { best: me(overall)?.value ?? null, today: me(classToday)?.value ?? null, overallRank: me(overall)?.rank ?? null, classRank: me(classToday)?.rank ?? null, plays: Number(plays) || 0 } : null,
    classToday: ct.map(pub),
    overall: ov.map(pub),
  };
}

const CQ_KEEP_MS = 20 * 60 * 1000;
const cqKey = () => `cq:${todayKST()}`;
async function cquiz(req, res, s, src) {
  const now = Date.now();
  const read = async () => (await s.list(cqKey())).map((r) => { try { return typeof r === 'string' ? JSON.parse(r) : r; } catch { return null; } })
    .filter((r) => r && now - r.at < CQ_KEEP_MS)
    .sort((a, b) => a.sec - b.sec || a.at - b.at); // 최종 기록(시간 + 벌점) 짧은 순
  if (req.method === 'GET') return res.status(200).json({ records: await read(), keepMin: 20 });
  if (req.method !== 'POST') return res.status(405).json({ error: '지원하지 않는 요청입니다.' });
  const group = Number(src.group), type = String(src.type || ''), sec = Math.round(Number(src.sec) * 10) / 10, wrong = Math.max(0, Math.min(99, Number(src.wrong) || 0));
  const ok = Math.max(0, Math.min(8, Math.round(Number(src.ok)) || 0));
  const pen = Math.max(0, Math.min(720, Math.round(Number(src.pen)) || 0)); // 틀림 벌점(초)
  const cls = CLASSES.includes(src.cls) ? src.cls : '';
  if (!(Number.isInteger(group) && group >= 1 && group <= 8) || !/^[A-H]$/.test(type) || !(sec >= 5 && sec <= 3600)) {
    return res.status(400).json({ error: '기록이 올바르지 않습니다.' });
  }
  await s.push(cqKey(), JSON.stringify({ group, type, sec, wrong, ok, pen, cls, at: now }));
  return res.status(200).json({ records: await read(), keepMin: 20 });
}

export default async function handler(req, res) {
  noStore(res);
  // 무게중심 수업 화면을 따로 배포한 주소(centroid-lesson…)에서도 모둠 기록판을 쓰도록 cquiz만 다른 주소의 요청을 허용
  const q0 = req.query || {};
  if (req.method === 'OPTIONS' || q0.game === 'cquiz' || (req.method === 'POST' && (readBody(req) || {}).game === 'cquiz')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
  }
  const s = store('site:');
  if (!s) return res.status(503).json({ error: '저장소가 아직 연결되지 않았습니다.' });
  try {
    const src = req.method === 'POST' ? readBody(req) || {} : req.query || {};
    const game = String(src.game || '');
    // 무게중심 수업 화면 ⑧ 모둠 스피드 퀴즈: 모둠 기록(걸린 시간)을 20분 동안 보여 준다(로그인 없이)
    if (game === 'cquiz') return await cquiz(req, res, s, src);
    const G = GAMES[game];
    if (!G) return res.status(400).json({ error: '게임이 올바르지 않습니다.' });
    const t = tokenOf(req);
    if (game === 'dungeon' && req.method === 'GET' && src.tower) return res.status(200).json({ tower: await towerToday(s) });
    // 선생님이 게임을 잠근 반은 기록 저장·상자·상점 등 바꾸는 요청을 받지 않는다(보기만 가능)
    if (req.method === 'POST' && t && String((await s.hget('state', `mat:games:${t.cls}`)) ?? '0') !== '1') { // 저장된 값이 없으면 잠김
      return res.status(403).json({ code: 'GAME_LOCKED', error: '지금은 게임이 잠겨 있어요. 문제풀이를 먼저 해요!' });
    }
    if (game === 'dungeon' && (src.profile || src.action)) {
      if (!t) return res.status(401).json({ code: 'LOGIN', error: '비밀번호로 다시 들어와 주세요.' });
      return await dungeon(req, res, s, t, src);
    }

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
    // 무게중심 스피드 퀴즈: 20문제 중 한 번에 맞힌 문제가 16개 이상이면 떨어진 사과 1개, 20개 모두면 2개(하루 최대 2개)
    let apple = null;
    if (game === 'cspeed') {
      const ok = Math.max(0, Math.min(20, Math.round(Number(src.ok)) || 0));
      apple = { ...(await giveGameApples(s, cls, num, ok >= 20 ? 2 : ok >= 16 ? 1 : 0)), ok };
    }
    return res.status(200).json({ saved: value, newBest, apple, ...(await view(s, game, cls, num)) });
  } catch (e) {
    console.error('game failed', e);
    return res.status(502).json({ error: '기록을 저장하지 못했어요. 다시 시도해 주세요.' });
  }
}
