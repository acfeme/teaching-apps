import {
  CLASSES, LOCK_KEYS, adminView, fbField, fbStatus, lockField, normFb, attField, checkAdmin, noStore, normAtt, normCfg, readBody, readList,
  requireStore, todayKST, validStage, validStudent,
} from './_lib.js';
import { unitFrom } from './_units.js';

// 배포 버전(새 버전이 올라오면 관리자 화면에 새로고침 안내)
const BUILD = (process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(-8);

// GET  /api/admin?date=&dates=1 → 잠금 상태, 학생별 응시 상태, 경고, 날짜별 기록
// POST /api/admin {action:'cfg', cls, key:'open'|'s1'|'s2', value}
//                 {action:'retake', cls, num, stage}     stage: 1 | 2 | 'fb'
//                 {action:'retakeAll', cls, stage}
export default async function handler(req, res) {
  noStore(res);
  const U = unitFrom(req, res);
  if (!U) return undefined;
  const s = requireStore(res, U);
  if (!s) return undefined;
  if (!(await checkAdmin(req, res, s))) return undefined;

  try {
    if (req.method === 'GET') return await view(req, res, s, U);
    if (req.method === 'POST') return await act(req, res, s, U);
    return res.status(405).json({ error: '지원하지 않는 요청입니다.' });
  } catch (e) {
    console.error('admin failed', e);
    return res.status(502).json({ error: '처리하지 못했습니다. 다시 시도해 주세요.' });
  }
}

async function view(req, res, s, U) {
  const today = todayKST();
  const asked = String(req.query?.date || today);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : today;

  const [state, records, warnings, fbRecs] = await Promise.all([
    s.hgetall('state'), readList(s, `subs:${date}`), readList(s, `warn:${date}`), readList(s, `fbs:${date}`),
  ]);
  let dates;
  if (req.query?.dates) {
    dates = (await s.smembers('dates')).map(String);
    if (!dates.includes(today)) dates.push(today);
    dates.sort().reverse();
  }

  const cfg = normCfg(state);
  const students = {};
  for (const [field, raw] of Object.entries(state)) {
    const m = /^(\d-\d):(\d+):(\d|fb)$/.exec(field);
    if (!m) continue;
    const key = `${m[1]}#${m[2]}`;
    students[key] ||= { cls: m[1], num: Number(m[2]), stages: {} };
    if (m[3] === 'fb') students[key].fbRaw = raw;
    else students[key].stages[m[3]] = normAtt(raw);
  }
  // 피드백 문제 상태와 진도: none | ready(대상, 아직 안 함) | active(푸는 중) | done(끝냄) | again(재응시 허용됨)
  for (const st of Object.values(students)) {
    const f = normFb(st.fbRaw);
    delete st.fbRaw;
    const a = f.active;
    st.fb = {
      status: U.FB_BLANKS ? fbStatus(st.stages[1] || normAtt(null), f) : 'none',
      done: f.done, allowed: f.allowed, last: f.last,
      active: a && {
        startedAt: a.startedAt,
        items: a.ids.map((id) => ({ id, solved: a.solved.includes(id), tries: a.tries[id] || 0 })),
      },
    };
  }
  for (const r of records) {
    const key = `${r.cls}#${r.num}`;
    students[key] ||= { cls: r.cls, num: r.num, stages: {} };
  }
  const warnCount = {};
  for (const w of warnings) warnCount[`${w.cls}#${w.num}`] = (warnCount[`${w.cls}#${w.num}`] || 0) + 1;
  const list = Object.entries(students)
    .map(([key, v]) => ({ ...v, warnings: warnCount[key] || 0 }))
    .sort((a, b) => a.cls.localeCompare(b.cls) || a.num - b.num);

  const log = [...records]
    .sort((a, b) => b.submittedAt - a.submittedAt)
    .map((r) => ({
      cls: r.cls, num: r.num, stage: r.stage, attempt: r.attempt, score: r.score, correct: r.correct,
      total: r.total, warnings: r.warnings || 0, startedAt: r.startedAt, submittedAt: r.submittedAt,
      results: r.results, answers: r.answers,
    }));

  return res.status(200).json({
    today, date, dates, cfg, lockVer: Number(state.lockver || 0), build: BUILD,
    students: list, warnings: [...warnings].reverse(), log,
    fbLog: [...fbRecs].sort((a, b) => b.finishedAt - a.finishedAt),
    scopes: adminView(U, records),
  });
}

async function act(req, res, s, U) {
  const body = readBody(req) || {};
  if (body.action === 'cfg') {
    if (!CLASSES.includes(body.cls) || !LOCK_KEYS.includes(body.key) || typeof body.value !== 'boolean') {
      return res.status(400).json({ error: '설정 값이 올바르지 않습니다.' });
    }
    // 스위치 하나만 바로 덮어쓴다(다른 스위치는 건드리지 않음).
    await s.hset('state', { [lockField(body.cls, body.key)]: body.value ? '1' : '0' });
    // 잠금 변경 번호: 화면이 이보다 오래된 상태를 받으면(저장 직후 예전 값을 읽는 경우) 무시한다
    const lockVer = await s.hincr('state', 'lockver');
    return res.status(200).json({ ok: true, cls: body.cls, key: body.key, value: body.value, lockVer, build: BUILD });
  }

  // 피드백 문제 재응시: 끝낸 횟수만큼 다 쓴 학생에게 한 번 더
  const reopenFb = (raw) => {
    const fb = normFb(raw);
    if (fb.active || fb.done < fb.allowed) return null;
    fb.allowed = fb.done + 1;
    return JSON.stringify(fb);
  };
  if (body.action === 'retake' && body.stage === 'fb') {
    const num = validStudent(body.cls, body.num);
    if (!num) return res.status(400).json({ error: '학생 정보가 올바르지 않습니다.' });
    const field = fbField(body.cls, num);
    const next = reopenFb(await s.hget('state', field));
    if (next) await s.hset('state', { [field]: next });
    return res.status(200).json({ ok: true, changed: !!next });
  }
  if (body.action === 'retakeAll' && body.stage === 'fb') {
    if (!CLASSES.includes(body.cls)) return res.status(400).json({ error: '반이 올바르지 않습니다.' });
    const state = await s.hgetall('state');
    const updates = {};
    for (const [field, raw] of Object.entries(state)) {
      if (!field.startsWith(`${body.cls}:`) || !field.endsWith(':fb')) continue;
      const next = reopenFb(raw);
      if (next) updates[field] = next;
    }
    if (Object.keys(updates).length) await s.hset('state', updates);
    return res.status(200).json({ ok: true, changed: Object.keys(updates).length });
  }

  if (body.action === 'retake') {
    const num = validStudent(body.cls, body.num);
    const stage = validStage(body.stage, U);
    if (!num || !stage) return res.status(400).json({ error: '학생 정보가 올바르지 않습니다.' });
    const field = attField(body.cls, num, stage);
    const att = normAtt(await s.hget('state', field));
    if (att.active || att.used < att.allowed) return res.status(200).json({ ok: true, changed: false });
    att.allowed = att.used + 1;
    await s.hset('state', { [field]: JSON.stringify(att) });
    return res.status(200).json({ ok: true, changed: true });
  }

  if (body.action === 'retakeAll') {
    const stage = validStage(body.stage, U);
    if (!CLASSES.includes(body.cls) || !stage) return res.status(400).json({ error: '반 또는 단계가 올바르지 않습니다.' });
    const state = await s.hgetall('state');
    const updates = {};
    for (const [field, raw] of Object.entries(state)) {
      if (!field.startsWith(`${body.cls}:`) || !field.endsWith(`:${stage}`)) continue;
      const att = normAtt(raw);
      if (att.active || att.used < att.allowed) continue;
      att.allowed = att.used + 1;
      updates[field] = JSON.stringify(att);
    }
    if (Object.keys(updates).length) await s.hset('state', updates);
    return res.status(200).json({ ok: true, changed: Object.keys(updates).length });
  }

  return res.status(400).json({ error: '알 수 없는 요청입니다.' });
}
