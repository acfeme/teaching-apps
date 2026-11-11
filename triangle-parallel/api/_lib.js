import crypto from 'node:crypto';
import { Redis } from '@upstash/redis';
import { sameValue } from './_grade.js';

export const CLASSES = ['2-1', '2-2', '2-3', '2-4'];
export const MAX_NUMBER = 35;

// Redis 키 (앞에 유닛 prefix가 붙는다. 삼각형과 평행선 = 'tp:')
//   state (hash)       `lock:${반}:${open|s1|s2}` → 잠금 스위치('1' 열림), `${반}:${번호}:${단계}` → 응시 상태
//   subs:{날짜} (list) 제출 기록
//   warn:{날짜} (list) 다른 창 경고 기록
//   dates (set)        기록이 있는 날짜

export function todayKST(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

// ---- 저장소 ----
function createStore(prefix) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    const r = new Redis({ url, token, automaticDeserialization: false });
    const k = (x) => prefix + x;
    return {
      hget: (key, field) => r.hget(k(key), field),
      hmget: async (key, ...fields) => {
        const res = await r.hmget(k(key), ...fields);
        if (!res) return fields.map(() => null);
        if (Array.isArray(res)) return res;
        return fields.map((x) => res[x] ?? null);
      },
      hgetall: async (key) => (await r.hgetall(k(key))) || {},
      hset: (key, obj) => r.hset(k(key), obj),
      hdel: (key, ...fields) => r.hdel(k(key), ...fields),
      hincr: async (key, field) => Number(await r.hincrby(k(key), field, 1)),
      push: (key, v) => r.rpush(k(key), v),
      list: async (key) => (await r.lrange(k(key), 0, -1)) || [],
      sadd: (key, v) => r.sadd(k(key), v),
      smembers: async (key) => (await r.smembers(k(key))) || [],
      incrWithExpire: async (key, sec) => {
        const n = await r.incr(k(key));
        if (Number(n) === 1) await r.expire(k(key), sec);
        return Number(n);
      },
      get: (key) => r.get(k(key)),
      del: (key) => r.del(k(key)),
    };
  }
  if (process.env.LOCAL_DEV === '1') return memoryStore();
  return null;
}

function memoryStore() {
  const hashes = new Map(); const lists = new Map(); const sets = new Map(); const nums = new Map();
  const h = (key) => { if (!hashes.has(key)) hashes.set(key, {}); return hashes.get(key); };
  return {
    hget: async (key, f) => h(key)[f] ?? null,
    hmget: async (key, ...fs) => fs.map((f) => h(key)[f] ?? null),
    hgetall: async (key) => ({ ...h(key) }),
    hset: async (key, obj) => { Object.assign(h(key), obj); },
    hdel: async (key, ...fs) => { fs.forEach((f) => { delete h(key)[f]; }); },
    hincr: async (key, f) => { const n = Number(h(key)[f] || 0) + 1; h(key)[f] = String(n); return n; },
    push: async (key, v) => { if (!lists.has(key)) lists.set(key, []); lists.get(key).push(v); },
    list: async (key) => lists.get(key) || [],
    sadd: async (key, v) => { if (!sets.has(key)) sets.set(key, new Set()); sets.get(key).add(v); },
    smembers: async (key) => [...(sets.get(key) || [])],
    incrWithExpire: async (key) => { const n = (nums.get(key) || 0) + 1; nums.set(key, n); return n; },
    get: async (key) => nums.get(key) ?? null,
    del: async (key) => { nums.delete(key); },
  };
}

// 유닛마다 저장 공간이 따로다(로컬 시험용 메모리 저장소도 유닛별로 따로 만든다).
const cached = new Map();
export function store(prefix) {
  if (!cached.has(prefix)) cached.set(prefix, createStore(prefix));
  return cached.get(prefix);
}

export function requireStore(res, U) {
  const s = store(U.prefix);
  if (!s) {
    res.status(503).json({ error: '저장소가 아직 연결되지 않았습니다.' });
    return null;
  }
  return s;
}

const parse = (raw) => {
  if (raw == null) return null;
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return null; }
};

// ---- 반별 잠금 ----
// 잠금 스위치는 하나씩 따로 저장한다(`lock:2-1:open` = '1' | '0').
// 예전처럼 cfg 하나에 통째로 저장하면 스위치를 연달아 바꿀 때 앞의 변경이 덮어써져 사라진다.
export const LOCK_KEYS = ['open', 's1', 's2'];
export const lockField = (cls, key) => `lock:${cls}:${key}`;
export const LOCK_FIELDS = CLASSES.flatMap((c) => LOCK_KEYS.map((k) => lockField(c, k)));

// values: { 필드: 값 } 또는 LOCK_FIELDS 순서의 배열
export function normCfg(values) {
  const get = Array.isArray(values)
    ? (f) => values[LOCK_FIELDS.indexOf(f)]
    : (f) => values?.[f];
  const out = {};
  for (const c of CLASSES) {
    out[c] = {};
    for (const k of LOCK_KEYS) out[c][k] = String(get(lockField(c, k)) ?? '0') === '1';
  }
  return out;
}

// ---- 학생별 응시 상태 ----
export const attField = (cls, num, stage) => `${cls}:${num}:${stage}`;
export function normAtt(raw) {
  const v = parse(raw) || {};
  return {
    allowed: Number.isInteger(v.allowed) ? v.allowed : 1,
    used: Number.isInteger(v.used) ? v.used : 0,
    active: v.active || null,
    last: v.last || null,
  };
}

// 학생 화면에 보여 줄 단계 상태
export function stageStatus(cfg, cls, att, stage) {
  if (att.active) return 'active';
  if (att.used >= att.allowed) return 'done';
  if (!cfg[cls]?.open || !cfg[cls][`s${stage}`]) return 'locked';
  return 'ready';
}

export function validStudent(cls, num) {
  const n = Number(num);
  return CLASSES.includes(cls) && Number.isInteger(n) && n >= 1 && n <= MAX_NUMBER ? n : null;
}
export const validStage = (stage, U) => (U.STAGES.includes(Number(stage)) ? Number(stage) : null);

// ---- 채점 ----
function matchBlank(input, answer) {
  const s = String(input ?? '').trim().slice(0, 16);
  if (/^[a-z]$/.test(answer)) return s.toLowerCase() === answer;
  return sameValue(s, answer);
}

export function gradeStage(U, stage, submitted) {
  const key = U.ANSWERS[stage];
  const results = {};
  const answers = {};
  let correct = 0;
  for (const [id, want] of Object.entries(key)) {
    const got = Array.isArray(submitted?.[id]) ? submitted[id] : [];
    const given = want.map((_, i) => String(got[i] ?? '').trim().slice(0, 16));
    const blanks = want.map((a, i) => (matchBlank(given[i], a) ? 1 : 0));
    const ok = blanks.every(Boolean) ? 1 : 0;
    results[id] = { ok, blanks };
    answers[id] = given;
    if (ok) correct++;
  }
  const total = Object.keys(key).length;
  return { results, answers, correct, total, score: Math.round((correct / total) * 100) };
}

// 한 문제만 채점(피드백 문제용 — 비례식 칸만)
export function gradeFb(U, id, submitted) {
  const idx = U.FB_BLANKS?.[id];
  if (!idx) return null;
  const want = idx.map((i) => U.ANSWERS[1][id][i]);
  const got = Array.isArray(submitted) ? submitted : [];
  const given = want.map((_, i) => String(got[i] ?? '').trim().slice(0, 16));
  const blanks = want.map((a, i) => (matchBlank(given[i], a) ? 1 : 0));
  return { ok: blanks.every(Boolean), blanks, given, want, explain: U.EXPLAIN[id] };
}

// ---- 피드백(보충) 문제: 1단계에서 맞힌 문제가 FB_MAX개 이하인 학생이 1단계 문제 FB_COUNT개를 완전학습 ----
export const FB_MAX = 4;
export const FB_COUNT = 5;
export const fbField = (cls, num) => `${cls}:${num}:fb`;
export function normFb(raw) {
  const v = parse(raw) || {};
  return {
    active: v.active || null,
    done: Number.isInteger(v.done) ? v.done : 0,
    allowed: Number.isInteger(v.allowed) ? v.allowed : 1, // 한 번 끝내면 선생님이 재응시를 열어야 다시 풀 수 있다
    last: v.last || null,
  };
}
// 1단계 응시 상태로 대상인지 판단(풀이 중이면 아직 대상 아님). 대상이면 선생님 스위치 없이 자동으로 열린다.
export const fbEligible = (att1) => !att1.active && !!att1.last && att1.last.correct <= FB_MAX;
// active | none(대상 아님) | done(끝냄, 재응시 필요) | ready(처음) | again(재응시 허용됨)
export function fbStatus(att1, fb) {
  if (fb.active) return 'active';
  if (!fbEligible(att1)) return 'none';
  if (fb.done >= fb.allowed) return 'done';
  return fb.done > 0 ? 'again' : 'ready';
}

export function feedbackFor(U, stage, results) {
  const out = {};
  for (const [id, want] of Object.entries(U.ANSWERS[stage])) {
    out[id] = { ok: results[id].ok, blanks: results[id].blanks, answer: want, explain: U.EXPLAIN[id] };
  }
  return out;
}

export async function readList(s, key) {
  return (await s.list(key)).map(parse).filter(Boolean);
}

// ---- 순위: 그날 단계별 마지막 제출 점수의 합, 동점이면 먼저 도달한 학생이 앞 ----
export function latestPerStudent(records) {
  const map = new Map();
  for (const r of records) {
    const key = `${r.cls}#${r.num}`;
    if (!map.has(key)) map.set(key, { cls: r.cls, num: r.num, stages: {} });
    const st = map.get(key);
    const prev = st.stages[r.stage];
    if (!prev || r.submittedAt > prev.submittedAt) st.stages[r.stage] = r;
  }
  return [...map.values()].map((st) => {
    const recs = Object.values(st.stages);
    return {
      cls: st.cls, num: st.num,
      total: recs.reduce((t, r) => t + r.score, 0),
      s1: st.stages[1]?.score ?? null,
      s2: st.stages[2]?.score ?? null,
      reachedAt: Math.max(...recs.map((r) => r.submittedAt)),
    };
  });
}

export function rank(list) {
  return [...list]
    .sort((a, b) => b.total - a.total || a.reachedAt - b.reachedAt || a.cls.localeCompare(b.cls) || a.num - b.num)
    .map((x, i) => ({ rank: i + 1, ...x }));
}

// 문항별 정답률: 그날 학생별·단계별 첫 제출 기준(재응시 효과 제외)
function firstPerStudentStage(records) {
  const map = new Map();
  for (const r of records) {
    const key = `${r.cls}#${r.num}#${r.stage}`;
    const prev = map.get(key);
    if (!prev || r.submittedAt < prev.submittedAt) map.set(key, r);
  }
  return [...map.values()];
}

export function adminView(U, records) {
  const firsts = firstPerStudentStage(records);
  const latest = latestPerStudent(records);
  const scopes = {};
  for (const c of ['all', ...CLASSES]) {
    const inScope = (x) => c === 'all' || x.cls === c;
    const stages = {};
    for (const st of U.STAGES) {
      const rs = firsts.filter((r) => r.stage === st && inScope(r));
      const rates = {};
      for (const [id, want] of Object.entries(U.ANSWERS[st])) {
        const n = rs.length;
        const ok = rs.filter((r) => r.results?.[id]?.ok).length;
        rates[id] = {
          correct: ok, n, rate: n ? Math.round((ok / n) * 100) : 0,
          blanks: want.map((_, i) => {
            const b = rs.filter((r) => r.results?.[id]?.blanks?.[i]).length;
            return n ? Math.round((b / n) * 100) : 0;
          }),
        };
      }
      stages[st] = {
        students: rs.length,
        avg: rs.length ? Math.round((rs.reduce((t, r) => t + r.score, 0) / rs.length) * 10) / 10 : 0,
        rates,
      };
    }
    scopes[c] = { stages, ranking: rank(latest.filter(inScope)) };
  }
  return scopes;
}

// ---- 관리자 인증 ----
const MAX_FAILS = 10;
const FAIL_WINDOW_SEC = 600;

export async function checkAdmin(req, res, s) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) { res.status(503).json({ error: '관리자 비밀번호가 설정되지 않았습니다.' }); return false; }
  const ip = String(req.headers['x-forwarded-for'] || 'local').split(',')[0].trim();
  const failKey = `adminfail:${ip}`;
  const fails = Number(await s.get(failKey)) || 0;
  if (fails >= MAX_FAILS) {
    res.status(429).json({ error: '시도가 너무 많습니다. 10분 뒤 다시 입력해 주세요.' });
    return false;
  }
  const a = crypto.createHash('sha256').update(String(req.headers['x-admin-password'] ?? '')).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  if (!crypto.timingSafeEqual(a, b)) {
    await s.incrWithExpire(failKey, FAIL_WINDOW_SEC);
    res.status(401).json({ error: '비밀번호가 맞지 않습니다.' });
    return false;
  }
  if (fails > 0) await s.del(failKey);
  return true;
}

export function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return null;
}

export function noStore(res) { res.setHeader('Cache-Control', 'no-store'); }

// ---- 사과나무와 보관함 ----
// 나무 크기 = 1·2단계에서 맞힌 문제 수(마지막 응시 기준). 유닛마다 문제 수가 달라 20칸 기준으로 맞춰 그린다.
// 다 자란 나무(20칸 중 17칸 이상)에 사과가 열리고(최대 8개), 피드백 문제를 한 번 끝낼 때마다 보너스 사과 1개.
// 열린 사과는 학생이 보관함에서 수확한다(수확한 수는 `${반}:${번호}:garden`에 저장, 줄어들지 않는다).
export const gardenField = (cls, num) => `${cls}:${num}:garden`;
export const treeStep = (n, max) => Math.round((Math.max(0, Math.min(max, n)) * 20) / max);
export const treeApples = (n, max) => { const t = treeStep(n, max); return t >= 17 ? (t - 16) * 2 : 0; };
export function normGarden(raw) {
  const v = parse(raw) || {};
  return { harvested: Number.isInteger(v.harvested) ? v.harvested : 0, at: v.at || null };
}
// 한 유닛의 학생 나무 상태
export function gardenOf(U, attRaws, fbRaw, gardenRaw) {
  const n = U.STAGES.reduce((t, st, i) => t + (normAtt(attRaws[i]).last?.correct || 0), 0);
  const fbDone = normFb(fbRaw).done;
  const g = normGarden(gardenRaw);
  const ripe = treeApples(n, U.MAX) + fbDone;
  return { n, max: U.MAX, ripe, fbDone, harvested: g.harvested, ready: Math.max(0, ripe - g.harvested), at: g.at };
}
