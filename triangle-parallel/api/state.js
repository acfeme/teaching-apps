import {
  FB_COUNT, LOCK_FIELDS, attField, fbField, fbStatus, normFb, noStore, normAtt, normCfg, requireStore, stageStatus, validStudent,
} from './_lib.js';
import { STAGES } from './_answers.js';

// GET /api/state            → 반별 입장 가능 여부
// GET /api/state?cls=&num=  → 그 학생의 단계별 상태와 사과나무 크기
export default async function handler(req, res) {
  noStore(res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET만 가능합니다.' });
  const s = requireStore(res);
  if (!s) return undefined;

  try {
    if (!req.query?.cls) {
      const cfg = normCfg(await s.hmget('state', ...LOCK_FIELDS));
      return res.status(200).json({ open: Object.fromEntries(Object.entries(cfg).map(([c, v]) => [c, v.open])) });
    }
    const cls = req.query.cls;
    const num = validStudent(cls, req.query.num);
    if (!num) return res.status(400).json({ error: '반 또는 번호가 올바르지 않습니다.' });

    const vals = await s.hmget('state', ...LOCK_FIELDS, ...STAGES.map((st) => attField(cls, num, st)), fbField(cls, num));
    const cfg = normCfg(vals.slice(0, LOCK_FIELDS.length));
    const atts = vals.slice(LOCK_FIELDS.length, LOCK_FIELDS.length + STAGES.length);
    const fb = normFb(vals[LOCK_FIELDS.length + STAGES.length]);
    const stages = {};
    let tree = 0;
    STAGES.forEach((st, i) => {
      const att = normAtt(atts[i]);
      stages[st] = { status: stageStatus(cfg, cls, att, st), last: att.last, attempt: att.used, active: att.active };
      tree += att.last?.correct || 0;
    });
    const fbInfo = {
      status: fbStatus(normAtt(atts[0]), fb),
      done: fb.done,
      solved: fb.active ? fb.active.solved.length : 0,
      count: fb.active ? fb.active.ids.length : FB_COUNT,
    };
    return res.status(200).json({ open: cfg[cls].open, stages, tree, fb: fbInfo });
  } catch (e) {
    console.error('state failed', e);
    return res.status(502).json({ error: '상태를 불러오지 못했습니다.' });
  }
}
