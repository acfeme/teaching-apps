import {
  CLASSES, MAX_NUMBER, grade, readBody, requireStore, todayKST,
} from './_lib.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능합니다.' });

  const body = readBody(req);
  const cls = body?.cls;
  const num = Number(body?.num);
  if (!CLASSES.includes(cls) || !Number.isInteger(num) || num < 1 || num > MAX_NUMBER) {
    return res.status(400).json({ error: '반 또는 번호가 올바르지 않습니다.' });
  }
  if (!body.answers || typeof body.answers !== 'object') {
    return res.status(400).json({ error: '답안이 없습니다.' });
  }

  const s = requireStore(res);
  if (!s) return undefined;

  const graded = grade(body.answers);
  const now = new Date();
  const date = todayKST(now);
  const record = { cls, num, date, ...graded, submittedAt: now.getTime() };

  try {
    await s.push(`subs:${date}`, JSON.stringify(record));
    await s.sadd('dates', date);
  } catch (e) {
    console.error('save failed', e);
    return res.status(502).json({ error: '저장하지 못했습니다. 다시 제출해 주세요.' });
  }
  return res.status(200).json(record);
}
