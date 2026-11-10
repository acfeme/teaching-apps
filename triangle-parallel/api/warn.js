import {
  noStore, readBody, requireStore, todayKST, validStage, validStudent,
} from './_lib.js';

const KINDS = { hidden: '다른 창·앱으로 이동', blur: '화면 밖을 누름(다른 창)' };

// POST /api/warn {cls, num, stage, kind} → 풀이 중 다른 창을 연 기록
export default async function handler(req, res) {
  noStore(res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능합니다.' });
  const body = readBody(req);
  const cls = body?.cls;
  const num = validStudent(cls, body?.num);
  const stage = validStage(body?.stage);
  if (!num || !stage) return res.status(400).json({ error: '반, 번호, 단계가 올바르지 않습니다.' });
  const kind = KINDS[body?.kind] ? body.kind : 'hidden';

  const s = requireStore(res);
  if (!s) return undefined;
  try {
    const now = new Date();
    await s.push(`warn:${todayKST(now)}`, JSON.stringify({ cls, num, stage, kind, label: KINDS[kind], at: now.getTime() }));
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('warn failed', e);
    return res.status(502).json({ error: '기록하지 못했습니다.' });
  }
}
