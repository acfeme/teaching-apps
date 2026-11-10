import crypto from 'node:crypto';
import { Redis } from '@upstash/redis';
import { ANSWERS, EXPLAIN, STAGES } from './_answers.js';
import { sameValue } from './_grade.js';

export const CLASSES = ['2-1', '2-2', '2-3', '2-4'];
export const MAX_NUMBER = 35;
const PREFIX = 'tp:';

// Redis 키
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
function createStore() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    const r = new Redis({ url, token, automaticDeserialization: false });
    const k = (x) => PREFIX + x;
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
    push: async (key, v) => { if (!lists.has(key)) lists.set(key, []); lists.get(key).push(v); },
    list: async (key) => lists.get(key) || [],
    sadd: async (key, v) => { if (!sets.has(key)) sets.set(key, new Set()); sets.get(key).add(v); },
    smembers: async (key) => [...(sets.get(key) || [])],
    incrWithExpire: async (key) => { const n = (nums.get(key) || 0) + 1; nums.set(key, n); return n; },
    get: async (key) => nums.get(key) ?? null,
    del: async (key) => { nums.delete(key); },
  };
}

let cached;
export function store() {
  if (cached === undefined) cached = createStore();
  return cached;
}

export function requireStore(res) {
  const s = store();
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
export const validStage = (stage) => (STAGES.includes(Number(stage)) ? Number(stage) : null);

// ---- 채점 ----
function matchBlank(input, answer) {
  const s = String(input ?? '').trim().slice(0, 16);
  if (/^[a-z]$/.test(answer)) return s.toLowerCase() === answer;
  return sameValue(s, answer);
}

export function gradeStage(stage, submitted) {
  const key = ANSWERS[stage];
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

export function feedbackFor(stage, results) {
  const out = {};
  for (const [id, want] of Object.entries(ANSWERS[stage])) {
    out[id] = { ok: results[id].ok, blanks: results[id].blanks, answer: want, explain: EXPLAIN[id] };
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

export function adminView(records) {
  const firsts = firstPerStudentStage(records);
  const latest = latestPerStudent(records);
  const scopes = {};
  for (const c of ['all', ...CLASSES]) {
    const inScope = (x) => c === 'all' || x.cls === c;
    const stages = {};
    for (const st of STAGES) {
      const rs = firsts.filter((r) => r.stage === st && inScope(r));
      const rates = {};
      for (const [id, want] of Object.entries(ANSWERS[st])) {
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
