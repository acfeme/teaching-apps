import {
  attField, feedbackFor, gradeStage, noStore, normAtt, readBody, requireStore, todayKST,
  validStage, validStudent,
} from './_lib.js';
import { unitFrom } from './_units.js';

// POST /api/submit {cls, num, stage, answers} → 채점, 기록 저장, 피드백
export default async function handler(req, res) {
  noStore(res);
  const U = unitFrom(req, res);
  if (!U) return undefined;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능합니다.' });
  const body = readBody(req);
  const cls = body?.cls;
  const num = validStudent(cls, body?.num);
  const stage = validStage(body?.stage, U);
  if (!num || !stage) return res.status(400).json({ error: '반, 번호, 단계가 올바르지 않습니다.' });
  if (!body.answers || typeof body.answers !== 'object') return res.status(400).json({ error: '답안이 없습니다.' });

  const s = requireStore(res, U);
  if (!s) return undefined;
  const fields = U.STAGES.map((st) => attField(cls, num, st));
  try {
    const raws = await s.hmget('state', ...fields);
    const atts = Object.fromEntries(U.STAGES.map((st, i) => [st, normAtt(raws[i])]));
    const att = atts[stage];
    if (!att.active) {
      return res.status(409).json({ code: 'NOT_ACTIVE', error: '이미 제출했거나 시작하지 않은 단계예요.' });
    }

    const prevTree = U.STAGES.reduce((t, st) => t + (atts[st].last?.correct || 0), 0);
    const graded = gradeStage(U, stage, body.answers);
    const now = new Date();
    const date = todayKST(now);
    const warnings = Math.max(0, Math.min(999, Number(body.warnings) || 0));
    const record = {
      cls, num, stage, attempt: att.active.attempt, date,
      startedAt: att.active.startedAt, submittedAt: now.getTime(), warnings,
      ...graded,
    };

    await s.push(`subs:${date}`, JSON.stringify(record));
    await s.sadd('dates', date);
    att.used += 1;
    att.active = null;
    att.last = { correct: graded.correct, total: graded.total, score: graded.score, at: record.submittedAt, date };
    await s.hset('state', { [attField(cls, num, stage)]: JSON.stringify(att) });

    const newTree = U.STAGES.reduce((t, st) => t + (st === stage ? graded.correct : (atts[st].last?.correct || 0)), 0);
    return res.status(200).json({
      stage, attempt: record.attempt, correct: graded.correct, total: graded.total, score: graded.score,
      submittedAt: record.submittedAt, answers: graded.answers,
      feedback: feedbackFor(U, stage, graded.results), prevTree, tree: newTree,
    });
  } catch (e) {
    console.error('submit failed', e);
    return res.status(502).json({ error: '저장하지 못했습니다. 다시 제출해 주세요.' });
  }
}
