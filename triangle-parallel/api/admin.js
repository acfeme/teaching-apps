import crypto from 'node:crypto';
import { adminView, readRecords, requireStore, todayKST } from './_lib.js';

const MAX_FAILS = 10;
const FAIL_WINDOW_SEC = 600;

function passwordOk(given, expected) {
  const a = crypto.createHash('sha256').update(String(given ?? '')).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET만 가능합니다.' });

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return res.status(503).json({ error: '관리자 비밀번호가 설정되지 않았습니다.' });

  const s = requireStore(res);
  if (!s) return undefined;

  const ip = String(req.headers['x-forwarded-for'] || 'local').split(',')[0].trim();
  const failKey = `adminfail:${ip}`;
  const fails = Number(await s.get(failKey)) || 0;
  if (fails >= MAX_FAILS) {
    return res.status(429).json({ error: '시도가 너무 많습니다. 10분 뒤 다시 입력해 주세요.' });
  }
  if (!passwordOk(req.headers['x-admin-password'], expected)) {
    await s.incrWithExpire(failKey, FAIL_WINDOW_SEC);
    return res.status(401).json({ error: '비밀번호가 맞지 않습니다.' });
  }
  if (fails > 0) await s.del(failKey);

  const today = todayKST();
  const asked = String(req.query?.date || today);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : today;
  try {
    const dates = (await s.smembers('dates')).map(String);
    if (!dates.includes(today)) dates.push(today);
    dates.sort().reverse();
    return res.status(200).json({ today, date, dates, ...adminView(await readRecords(s, date)) });
  } catch (e) {
    console.error('admin failed', e);
    return res.status(502).json({ error: '결과를 불러오지 못했습니다.' });
  }
}
