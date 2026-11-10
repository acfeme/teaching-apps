import {
  LOCK_FIELDS, attField, noStore, normAtt, normCfg, readBody, requireStore, validStage, validStudent,
} from './_lib.js';
import { unitFrom } from './_units.js';

// POST /api/start {cls, num, stage} → 응시 시작(이미 시작했으면 이어서 풀기)
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

  const s = requireStore(res, U);
  if (!s) return undefined;
  const field = attField(cls, num, stage);
  try {
    const vals = await s.hmget('state', ...LOCK_FIELDS, field);
    const cfg = normCfg(vals.slice(0, LOCK_FIELDS.length));
    const attRaw = vals[LOCK_FIELDS.length];
    const att = normAtt(attRaw);
    if (att.active) return res.status(200).json({ ok: true, resumed: true, ...att.active });
    if (!cfg[cls].open) return res.status(403).json({ code: 'CLASS_CLOSED', error: '아직 반이 열리지 않았어요. 선생님을 기다려 주세요.' });
    if (!cfg[cls][`s${stage}`]) return res.status(403).json({ code: 'STAGE_LOCKED', error: `${stage}단계가 아직 잠겨 있어요.` });
    if (att.used >= att.allowed) return res.status(409).json({ code: 'NO_ATTEMPT', error: '이미 풀었어요. 다시 풀려면 선생님께 재응시를 요청하세요.' });

    att.active = { startedAt: Date.now(), attempt: att.used + 1 };
    await s.hset('state', { [field]: JSON.stringify(att) });
    return res.status(200).json({ ok: true, resumed: false, ...att.active });
  } catch (e) {
    console.error('start failed', e);
    return res.status(502).json({ error: '시작하지 못했습니다. 다시 눌러 주세요.' });
  }
}
