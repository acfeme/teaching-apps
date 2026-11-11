// 닮음 탐구 교실의 문제풀이 유닛 목록.
// 새 유닛 추가: api/_unit-<id>.js(정답·풀이·피드백 칸)와 public/units/<id>/problems.js(문제·그림)를 만들고 아래 LIST에 한 줄 추가.
// 유닛마다 저장 공간 앞머리(prefix)가 달라 기록이 섞이지 않는다.
import * as triangleParallel from './_unit-triangle-parallel.js';
import * as centroid from './_unit-centroid.js';

const LIST = [triangleParallel, centroid];

export const UNITS = Object.fromEntries(LIST.map((m) => [m.UNIT.id, {
  ...m.UNIT,
  ANSWERS: m.ANSWERS,
  EXPLAIN: m.EXPLAIN,
  STAGES: m.STAGES,
  FB_BLANKS: m.FB_BLANKS || null,
  FB_MID: m.FB_MID || [],
  FB_MID_COUNT: m.FB_MID_COUNT || 0,
  MAX: m.STAGES.reduce((t, st) => t + Object.keys(m.ANSWERS[st]).length, 0), // 나무가 다 자라는 문제 수
}]));

// 유닛을 지정하지 않은 요청(허브 이전에 열린 화면)은 삼각형과 평행선으로 처리한다.
export const DEFAULT_UNIT = 'triangle-parallel';

export function unitFrom(req, res) {
  const id = String(req.query?.unit || DEFAULT_UNIT);
  const U = UNITS[id];
  if (!U) {
    res.status(404).json({ error: '없는 유닛입니다.' });
    return null;
  }
  return U;
}

// 선생님이 반별로 열어 줘야 볼 수 있는 수업 자료(public/m/<id>/). 허브 목록(public/engine/units.js)과 id가 같아야 한다.
// 'games'는 게임 전체 잠금 스위치(수업 자료와 같은 방식). 처음에는 모든 반이 잠김(선생님이 열어 줘야 함).
export const MATERIALS = ['lesson', 'right-triangle', 'games'];
export const OPEN_BY_DEFAULT = []; // 처음부터 열려 있게 할 자료 id(지금은 없음)
