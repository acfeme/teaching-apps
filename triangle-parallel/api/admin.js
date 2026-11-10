import {
  CLASSES, LOCK_KEYS, adminView, fbEligible, lockField, normFb, attField, checkAdmin, noStore, normAtt, normCfg, readBody, readList,
  requireStore, todayKST, validStage, validStudent,
} from './_lib.js';

// GET  /api/admin?date=&dates=1 → 잠금 상태, 학생별 응시 상태, 경고, 날짜별 기록
// POST /api/admin {action:'cfg', cls, key:'open'|'s1'|'s2', value}
//                 {action:'retake', cls, num, stage}
//                 {action:'retakeAll', cls, stage}
export default async function handler(req, res) {
  noStore(res);
  const s = requireStore(res);
  if (!s) return undefined;
  if (!(await checkAdmin(req, res, s))) return undefined;

  try {
    if (req.method === 'GET') return await view(req, res, s);
    if (req.method === 'POST') return await act(req, res, s);
    return res.status(405).json({ error: '지원하지 않는 요청입니다.' });
  } catch (e) {
    console.error('admin failed', e);
    return res.status(502).json({ error: '처리하지 못했습니다. 다시 시도해 주세요.' });
  }
}

async function view(req, res, s) {
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
    if (m[3] === 'fb') {
      const fb = normFb(raw);
      students[key].fbRaw = { done: fb.done, last: fb.last, active: fb.active && { solved: fb.active.solved.length, count: fb.active.ids.length, startedAt: fb.active.startedAt } };
    } else students[key].stages[m[3]] = normAtt(raw);
  }
  // 피드백 문제 상태: none(대상 아님) | wait(대상, 아직 안 함) | active | done
  for (const st of Object.values(students)) {
    const f = st.fbRaw || { done: 0, last: null, active: null };
    delete st.fbRaw;
    const eligible = fbEligible(st.stages[1] || normAtt(null));
    st.fb = { ...f, eligible, status: f.active ? 'active' : f.done > 0 ? 'done' : eligible ? 'wait' : 'none' };
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
    today, date, dates, cfg, students: list, warnings: [...warnings].reverse(), log,
    fbLog: [...fbRecs].sort((a, b) => b.finishedAt - a.finishedAt),
    scopes: adminView(records),
  });
}

async function act(req, res, s) {
  const body = readBody(req) || {};
  if (body.action === 'cfg') {
    if (!CLASSES.includes(body.cls) || !LOCK_KEYS.includes(body.key) || typeof body.value !== 'boolean') {
      return res.status(400).json({ error: '설정 값이 올바르지 않습니다.' });
    }
    // 스위치 하나만 바로 덮어쓴다(다른 스위치는 건드리지 않음).
    await s.hset('state', { [lockField(body.cls, body.key)]: body.value ? '1' : '0' });
    return res.status(200).json({ ok: true, cls: body.cls, key: body.key, value: body.value });
  }

  if (body.action === 'retake') {
    const num = validStudent(body.cls, body.num);
    const stage = validStage(body.stage);
    if (!num || !stage) return res.status(400).json({ error: '학생 정보가 올바르지 않습니다.' });
    const field = attField(body.cls, num, stage);
    const att = normAtt(await s.hget('state', field));
    if (att.active || att.used < att.allowed) return res.status(200).json({ ok: true, changed: false });
    att.allowed = att.used + 1;
    await s.hset('state', { [field]: JSON.stringify(att) });
    return res.status(200).json({ ok: true, changed: true });
  }

  if (body.action === 'retakeAll') {
    const stage = validStage(body.stage);
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
