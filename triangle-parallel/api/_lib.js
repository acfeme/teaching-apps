import { Redis } from '@upstash/redis';
import { ANSWERS, IDS } from './_answers.js';
import { sameValue } from './_grade.js';

export const CLASSES = ['2-1', '2-2', '2-3', '2-4'];
export const MAX_NUMBER = 35;

const PREFIX = 'tp:';

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
    return {
      push: (k, v) => r.rpush(PREFIX + k, v),
      list: async (k) => (await r.lrange(PREFIX + k, 0, -1)) || [],
      sadd: (k, v) => r.sadd(PREFIX + k, v),
      smembers: async (k) => (await r.smembers(PREFIX + k)) || [],
      incrWithExpire: async (k, sec) => {
        const n = await r.incr(PREFIX + k);
        if (Number(n) === 1) await r.expire(PREFIX + k, sec);
        return Number(n);
      },
      get: async (k) => r.get(PREFIX + k),
      del: (k) => r.del(PREFIX + k),
    };
  }
  if (process.env.LOCAL_DEV === '1') return memoryStore();
  return null;
}

function memoryStore() {
  const lists = new Map(); const sets = new Map(); const nums = new Map();
  return {
    push: async (k, v) => { if (!lists.has(k)) lists.set(k, []); lists.get(k).push(v); },
    list: async (k) => lists.get(k) || [],
    sadd: async (k, v) => { if (!sets.has(k)) sets.set(k, new Set()); sets.get(k).add(v); },
    smembers: async (k) => [...(sets.get(k) || [])],
    incrWithExpire: async (k) => { const n = (nums.get(k) || 0) + 1; nums.set(k, n); return n; },
    get: async (k) => nums.get(k) ?? null,
    del: async (k) => { nums.delete(k); },
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

// ---- 채점 ----
export function grade(submitted) {
  const results = {};
  let correct = 0;
  for (const id of IDS) {
    const want = ANSWERS[id];
    const got = Array.isArray(submitted?.[id]) ? submitted[id] : [];
    const ok = want.every((a, i) => sameValue(String(got[i] ?? '').slice(0, 16), a));
    results[id] = ok ? 1 : 0;
    if (ok) correct++;
  }
  const total = IDS.length;
  return { results, correct, total, score: Math.round((correct / total) * 100) };
}

export async function readRecords(s, date) {
  const raw = await s.list(`subs:${date}`);
  return raw.map((v) => (typeof v === 'string' ? JSON.parse(v) : v));
}

// ---- 순위: 학생별 그날 최고 점수, 동점이면 그 점수를 먼저 낸 학생이 앞 ----
export function summarizeStudents(records) {
  const map = new Map();
  for (const r of records) {
    const key = `${r.cls}#${r.num}`;
    let st = map.get(key);
    if (!st) {
      st = { cls: r.cls, num: r.num, attempts: 0, first: r, best: r };
      map.set(key, st);
    }
    st.attempts++;
    if (r.submittedAt < st.first.submittedAt) st.first = r;
    if (r.score > st.best.score || (r.score === st.best.score && r.submittedAt < st.best.submittedAt)) st.best = r;
  }
  return [...map.values()];
}

export function rank(students) {
  return [...students]
    .sort((a, b) => b.best.score - a.best.score
      || a.best.submittedAt - b.best.submittedAt
      || a.cls.localeCompare(b.cls) || a.num - b.num)
    .map((s, i) => ({
      rank: i + 1, cls: s.cls, num: s.num, score: s.best.score, correct: s.best.correct,
      total: s.best.total, attempts: s.attempts, submittedAt: s.best.submittedAt,
    }));
}

// 문항별 정답률은 재도전 효과를 빼기 위해 학생별 첫 제출을 기준으로 한다.
export function itemRates(students) {
  const rates = {};
  for (const id of IDS) {
    let correct = 0;
    for (const s of students) if (s.first.results?.[id]) correct++;
    rates[id] = { correct, n: students.length, rate: students.length ? Math.round((correct / students.length) * 100) : 0 };
  }
  return rates;
}

export function adminView(records) {
  const students = summarizeStudents(records);
  const scopes = {};
  for (const c of ['all', ...CLASSES]) {
    const inScope = c === 'all' ? students : students.filter((s) => s.cls === c);
    const avg = inScope.length
      ? Math.round(inScope.reduce((t, s) => t + s.first.score, 0) / inScope.length * 10) / 10 : 0;
    scopes[c] = {
      students: inScope.length,
      submissions: inScope.reduce((t, s) => t + s.attempts, 0),
      avgFirst: avg,
      rates: itemRates(inScope),
      ranking: rank(inScope),
    };
  }
  const detail = students
    .sort((a, b) => a.cls.localeCompare(b.cls) || a.num - b.num)
    .map((s) => ({
      cls: s.cls, num: s.num, attempts: s.attempts,
      firstScore: s.first.score, bestScore: s.best.score,
      firstAt: s.first.submittedAt, bestAt: s.best.submittedAt,
      first: s.first.results, best: s.best.results,
    }));
  const log = [...records]
    .sort((a, b) => b.submittedAt - a.submittedAt)
    .map((r) => ({ cls: r.cls, num: r.num, score: r.score, correct: r.correct, total: r.total, submittedAt: r.submittedAt }));
  return { scopes, detail, log };
}

export function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return null;
}
