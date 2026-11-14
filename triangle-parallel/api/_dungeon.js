import crypto from 'node:crypto';
import { attField, fbField, gardenField, gardenOf, store, todayKST, gameApplesOf } from './_lib.js';
import { UNITS } from './_units.js';

// 평행선 던전 탐험: 학생 캐릭터·가방·꾸미기 아이템·사과 상점·반 협동 탑
// 사이트 저장소('site:')
//   dprof (hash)  `${반}:${번호}` → 프로필 JSON {char, bag, owned, wear, spent, chestDay, chestN}
//   avatar (hash) `${반}:${번호}` → 랭킹에 보일 캐릭터 모양(작은 JSON)
//   tower:{날짜} (hash) 반 → 오늘 쌓은 블록 수(맞힌 방 하나 = 블록 하나)
// 상자에서 나오는 아이템은 서버가 정한다(화면에서 마음대로 만들 수 없게).

export const TOOLS = ['lens', 'scissors', 'shield', 'potion'];
// 꾸미기 아이템: 자리(slot), 상점 가격(사과), 희귀(rare)는 상점에 없음
export const COSMETICS = {
  cap: { slot: 'head', price: 3 }, ribbon: { slot: 'head', price: 3 }, tophat: { slot: 'head', price: 5 }, helmet: { slot: 'head', price: 5 }, crown: { slot: 'head', rare: true },
  glasses: { slot: 'face', price: 3 }, sunglasses: { slot: 'face', price: 5 }, disguise: { slot: 'face', price: 5 },
  scarf: { slot: 'body', price: 3 }, star: { slot: 'body', price: 3 }, medal: { slot: 'body', price: 5 },
  chick: { slot: 'pet', price: 5 }, turtle: { slot: 'pet', price: 5 }, owl: { slot: 'pet', price: 8 }, cat: { slot: 'pet', price: 8 }, dragon: { slot: 'pet', rare: true },
};
const SHAPES = ['eq', 'right', 'iso', 'obtuse'];
const COLORS = 6;
const FACES = ['smile', 'brave', 'sleepy', 'wow'];
const CHEST_PER_DAY = 60;
const START_BAG = { lens: 2, scissors: 0, shield: 1, potion: 0 };

const who = (cls, num) => `${cls}:${num}`;
const parse = (raw) => { if (!raw) return null; if (typeof raw !== 'string') return raw; try { return JSON.parse(raw); } catch { return null; } };

function normProf(raw) {
  const p = parse(raw) || {};
  const bag = {};
  TOOLS.forEach((t) => { bag[t] = Math.max(0, Math.min(99, Number(p.bag?.[t]) || 0)); });
  const owned = Array.isArray(p.owned) ? p.owned.filter((id) => COSMETICS[id]) : [];
  const wear = {};
  ['head', 'face', 'body', 'pet'].forEach((sl) => { const id = p.wear?.[sl]; wear[sl] = id && owned.includes(id) && COSMETICS[id].slot === sl ? id : null; });
  const char = p.char && SHAPES.includes(p.char.shape) && FACES.includes(p.char.face) && Number.isInteger(p.char.color) && p.char.color >= 0 && p.char.color < COLORS ? p.char : null;
  return { char, bag, owned, wear, spent: Math.max(0, Number(p.spent) || 0), chestDay: p.chestDay || '', chestN: Number(p.chestN) || 0 };
}
const avatarOf = (p) => (p.char ? { ...p.char, head: p.wear.head, faceItem: p.wear.face, body: p.wear.body, pet: p.wear.pet } : null);

async function basketOf(cls, num) {
  let total = 0;
  for (const U of Object.values(UNITS)) {
    const s = store(U.prefix);
    // eslint-disable-next-line no-await-in-loop
    const vals = await s.hmget('state', ...U.STAGES.map((st) => attField(cls, num, st)), fbField(cls, num), gardenField(cls, num));
    total += gardenOf(U, vals.slice(0, U.STAGES.length), vals[U.STAGES.length], vals[U.STAGES.length + 1]).harvested;
  }
  return total + await gameApplesOf(store('site:'), cls, num); // 게임에서 주운 사과도 바구니에
}

function roll(p) {
  const r = crypto.randomInt(1000);
  const notOwned = (rare) => Object.keys(COSMETICS).filter((id) => !!COSMETICS[id].rare === rare && !p.owned.includes(id));
  if (r < 40) { const pool = notOwned(true); if (pool.length) return { kind: 'cos', id: pool[crypto.randomInt(pool.length)] }; }
  if (r < 340) { const pool = notOwned(false); if (pool.length) return { kind: 'cos', id: pool[crypto.randomInt(pool.length)] }; }
  const t = crypto.randomInt(100);
  return { kind: 'tool', id: t < 45 ? 'lens' : t < 70 ? 'scissors' : t < 85 ? 'shield' : 'potion' };
}

export async function dungeon(req, res, s, t, src) {
  const k = who(t.cls, t.num);
  const date = todayKST();
  const prof = normProf(await s.hget('dprof', k));
  const save = async () => {
    await s.hset('dprof', { [k]: JSON.stringify(prof) });
    const av = avatarOf(prof);
    if (av) await s.hset('avatar', { [k]: JSON.stringify(av) });
  };
  const view = async () => {
    const tw = await s.hgetall(`tower:${date}`);
    const basket = await basketOf(t.cls, t.num);
    return { profile: { char: prof.char, bag: prof.bag, owned: prof.owned, wear: prof.wear }, apples: Math.max(0, basket - prof.spent), basket, tower: tw || {}, cls: t.cls };
  };

  if (req.method === 'GET') return res.status(200).json(await view());
  const action = src.action;

  if (action === 'char') {
    const c = src.char || {};
    if (!SHAPES.includes(c.shape) || !FACES.includes(c.face) || !Number.isInteger(c.color) || c.color < 0 || c.color >= COLORS) {
      return res.status(400).json({ error: '캐릭터 모양이 올바르지 않습니다.' });
    }
    const first = !prof.char;
    prof.char = { shape: c.shape, color: c.color, face: c.face };
    if (first) prof.bag = { ...START_BAG };
    await save();
    return res.status(200).json(await view());
  }
  if (!prof.char) return res.status(409).json({ error: '먼저 캐릭터를 만들어요.' });

  if (action === 'wear') {
    const slot = ['head', 'face', 'body', 'pet'].includes(src.slot) ? src.slot : null;
    const id = src.id || null;
    if (!slot || (id && (!prof.owned.includes(id) || COSMETICS[id].slot !== slot))) return res.status(400).json({ error: '입을 수 없는 아이템이에요.' });
    prof.wear[slot] = id;
    await save();
    return res.status(200).json(await view());
  }
  if (action === 'use') {
    const id = String(src.id || '');
    if (!TOOLS.includes(id) || prof.bag[id] <= 0) return res.status(409).json({ error: '가방에 그 도구가 없어요.' });
    prof.bag[id] -= 1;
    await save();
    return res.status(200).json({ bag: prof.bag });
  }
  if (action === 'chest') {
    // 방 하나를 깰 때마다 상자 하나(하루 최대 60개) + 우리 반 탑에 블록 하나
    if (prof.chestDay !== date) { prof.chestDay = date; prof.chestN = 0; }
    if (prof.chestN >= CHEST_PER_DAY) return res.status(200).json({ drop: null, bag: prof.bag, limit: true });
    prof.chestN += 1;
    const drop = roll(prof);
    if (drop.kind === 'tool') prof.bag[drop.id] = Math.min(99, prof.bag[drop.id] + 1);
    else prof.owned.push(drop.id);
    await save();
    await s.hincr(`tower:${date}`, t.cls);
    return res.status(200).json({ drop, bag: prof.bag, owned: prof.owned });
  }
  if (action === 'buy') {
    const id = String(src.id || '');
    const c = COSMETICS[id];
    if (!c || c.rare) return res.status(400).json({ error: '상점에 없는 아이템이에요.' });
    if (prof.owned.includes(id)) return res.status(409).json({ error: '이미 가지고 있어요.' });
    const apples = Math.max(0, (await basketOf(t.cls, t.num)) - prof.spent);
    if (apples < c.price) return res.status(409).json({ error: `사과가 ${c.price - apples}개 더 필요해요.` });
    prof.spent += c.price;
    prof.owned.push(id);
    await save();
    return res.status(200).json(await view());
  }
  return res.status(400).json({ error: '알 수 없는 요청입니다.' });
}

// 오늘 반 탑(로그인 없이도 보기)
export async function towerToday(s) { return (await s.hgetall(`tower:${todayKST()}`)) || {}; }
export { parse as parseJson };
