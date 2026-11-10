import crypto from 'node:crypto';
import {
  FB_COUNT, LOCK_FIELDS, attField, fbEligible, fbField, gradeFb, noStore, normAtt, normCfg, normFb,
  readBody, requireStore, todayKST, validStudent,
} from './_lib.js';
import { unitFrom } from './_units.js';

// 피드백(보충) 문제 — 1단계를 FB_MAX개 이하로 맞힌 학생에게 자동으로 열리고, 1단계 문제 5개를 맞힐 때까지 푼다.
// 한 번 끝내면 선생님이 관리자 화면에서 재응시를 열어야 다시 풀 수 있다.
// POST /api/fb {action:'start', cls, num}            → 무작위 5문제(이미 풀던 것이 있으면 이어서)
// POST /api/fb {action:'check', cls, num, id, answers} → 한 문제 채점과 단계별 도움
//   틀린 횟수 1: 틀린 칸 표시(힌트 글은 화면에 있음) · 2: 풀이 요약 · 3 이상: 틀린 칸의 정답
export default async function handler(req, res) {
  noStore(res);
  const U = unitFrom(req, res);
  if (!U) return undefined;
  if (!U.FB_BLANKS) return res.status(404).json({ error: '이 유닛에는 피드백 문제가 없어요.' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능합니다.' });
  const body = readBody(req) || {};
  const cls = body.cls;
  const num = validStudent(cls, body.num);
  if (!num) return res.status(400).json({ error: '반 또는 번호가 올바르지 않습니다.' });
  const s = requireStore(res, U);
  if (!s) return undefined;

  const field = fbField(cls, num);
  try {
    if (body.action === 'start') return await start(res, s, cls, num, field, U);
    if (body.action === 'check') return await check(res, s, cls, num, field, body, U);
    return res.status(400).json({ error: '알 수 없는 요청입니다.' });
  } catch (e) {
    console.error('fb failed', e);
    return res.status(502).json({ error: '처리하지 못했습니다. 다시 눌러 주세요.' });
  }
}

// 2 = 비례식 칸만 채우는 방식
const FB_VERSION = 2;

const publicActive =(a) => ({ ids: a.ids, startedAt: a.startedAt, tries: a.tries, solved: a.solved });

async function start(res, s, cls, num, field, U) {
  const vals = await s.hmget('state', ...LOCK_FIELDS, attField(cls, num, 1), field);
  const cfg = normCfg(vals.slice(0, LOCK_FIELDS.length));
  const att1 = normAtt(vals[LOCK_FIELDS.length]);
  const fb = normFb(vals[LOCK_FIELDS.length + 1]);
  if (fb.active && fb.active.v !== FB_VERSION) fb.active = null; // 비례식만 쓰기 전 방식으로 시작한 풀이는 새로 시작
  if (fb.active) return res.status(200).json({ ok: true, resumed: true, ...publicActive(fb.active) });
  if (!fbEligible(att1)) return res.status(403).json({ code: 'FB_NOT_ELIGIBLE', error: '1단계 결과가 있어야 하고, 맞힌 문제가 4개 이하일 때만 풀 수 있어요.' });
  if (!cfg[cls].open) return res.status(403).json({ code: 'CLASS_CLOSED', error: '아직 반이 열리지 않았어요. 선생님을 기다려 주세요.' });
  if (fb.done >= fb.allowed) return res.status(409).json({ code: 'FB_DONE', error: '이미 피드백 문제를 끝냈어요. 다시 풀려면 선생님께 요청하세요.' });

  const shuffle = (list) => {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  // 중점 연결 문제 1개 + 비례식 문제 4개를 무작위로. 순서는 1단계 순서대로(쉬운 것부터)
  const mid = shuffle(U.FB_MID).slice(0, U.FB_MID_COUNT);
  const prop = shuffle(Object.keys(U.FB_BLANKS).filter((id) => !U.FB_MID.includes(id))).slice(0, FB_COUNT - mid.length);
  const ids = [...mid, ...prop].sort();
  fb.active = { v: FB_VERSION, ids, startedAt: Date.now(), tries: {}, wrong: {}, solved: [], round: fb.done + 1 };
  await s.hset('state', { [field]: JSON.stringify(fb) });
  return res.status(200).json({ ok: true, resumed: false, ...publicActive(fb.active) });
}

async function check(res, s, cls, num, field, body, U) {
  const fb = normFb(await s.hget('state', field));
  const a = fb.active;
  if (!a || a.v !== FB_VERSION) return res.status(409).json({ code: 'FB_NOT_ACTIVE', error: '풀고 있는 피드백 문제가 없어요. 처음 화면에서 다시 시작해 주세요.' });
  const id = String(body.id || '');
  if (!a.ids.includes(id)) return res.status(400).json({ error: '문제 번호가 올바르지 않습니다.' });
  if (a.solved.includes(id)) return res.status(200).json({ ok: true, already: true, solved: a.solved, finished: false });

  const g = gradeFb(U, id, body.answers);
  a.tries[id] = (a.tries[id] || 0) + 1;
  const out = { ok: g.ok, blanks: g.blanks, tries: a.tries[id] };

  if (g.ok) {
    a.solved.push(id);
    out.explain = g.explain; // 비례식을 맞히면 계산까지 이어진 풀이를 보여 준다
  } else {
    a.wrong[id] = (a.wrong[id] || 0) + 1;
    const w = a.wrong[id];
    out.wrong = w;
    out.level = Math.min(w, 3);
    if (w >= 2) out.explain = g.explain;
    if (w >= 3) out.reveal = Object.fromEntries(g.blanks.map((ok, i) => [i, ok]).filter(([, ok]) => !ok).map(([i]) => [i, g.want[i]]));
  }

  const finished = a.solved.length === a.ids.length;
  if (finished) {
    const now = Date.now();
    const totalTries = a.ids.reduce((t, x) => t + (a.tries[x] || 0), 0);
    const rec = {
      cls, num, round: a.round, ids: a.ids, tries: a.tries, totalTries,
      firstTry: a.ids.filter((x) => a.tries[x] === 1).length,
      warnings: Number.isInteger(body.warnings) ? Math.min(body.warnings, 999) : 0,
      startedAt: a.startedAt, finishedAt: now,
    };
    const date = todayKST(new Date(now));
    await s.push(`fbs:${date}`, JSON.stringify(rec));
    await s.sadd('dates', date);
    fb.done += 1;
    fb.last = { at: now, totalTries, firstTry: rec.firstTry, date };
    fb.active = null;
    out.summary = { totalTries, firstTry: rec.firstTry, count: a.ids.length };
  }
  await s.hset('state', { [field]: JSON.stringify(fb) });
  return res.status(200).json({ ...out, solved: a.solved, finished });
}
