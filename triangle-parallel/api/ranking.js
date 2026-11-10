import {
  CLASSES, latestPerStudent, noStore, rank, readList, requireStore, todayKST,
} from './_lib.js';
import { unitFrom } from './_units.js';

const CLASS_LIMIT = 5;
const OVERALL_LIMIT = 10;

// GET /api/ranking?cls= → 오늘 우리 반 상위 5명, 전체 상위 10명 (1·2단계 점수 합)
export default async function handler(req, res) {
  noStore(res);
  const U = unitFrom(req, res);
  if (!U) return undefined;
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET만 가능합니다.' });
  const cls = req.query?.cls;
  if (!CLASSES.includes(cls)) return res.status(400).json({ error: '반이 올바르지 않습니다.' });
  const s = requireStore(res, U);
  if (!s) return undefined;

  const date = todayKST();
  try {
    const list = latestPerStudent(await readList(s, `subs:${date}`));
    const strip = ({ rank: r, cls: c, num, total }) => ({ rank: r, cls: c, num, total });
    return res.status(200).json({
      date,
      classTop: rank(list.filter((x) => x.cls === cls)).slice(0, CLASS_LIMIT).map(strip),
      overallTop: rank(list).slice(0, OVERALL_LIMIT).map(strip),
    });
  } catch (e) {
    console.error('ranking failed', e);
    return res.status(502).json({ error: '순위를 불러오지 못했습니다.' });
  }
}
