import {
  CLASSES, rank, readRecords, requireStore, summarizeStudents, todayKST,
} from './_lib.js';

const CLASS_LIMIT = 5;
const OVERALL_LIMIT = 10;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET만 가능합니다.' });
  const cls = req.query?.cls;
  if (!CLASSES.includes(cls)) return res.status(400).json({ error: '반이 올바르지 않습니다.' });

  const s = requireStore(res);
  if (!s) return undefined;

  const date = todayKST();
  try {
    const students = summarizeStudents(await readRecords(s, date));
    const strip = ({ rank: r, cls: c, num, score, submittedAt }) => ({ rank: r, cls: c, num, score, submittedAt });
    return res.status(200).json({
      date,
      classTop: rank(students.filter((x) => x.cls === cls)).slice(0, CLASS_LIMIT).map(strip),
      overallTop: rank(students).slice(0, OVERALL_LIMIT).map(strip),
    });
  } catch (e) {
    console.error('ranking failed', e);
    return res.status(502).json({ error: '순위를 불러오지 못했습니다.' });
  }
}
