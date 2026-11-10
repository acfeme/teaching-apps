// 닮음 탐구 교실의 유닛 목록(허브 화면과 유닛 페이지가 함께 쓴다).
// kind: 'quiz'  = 이 사이트 안의 문제풀이 유닛(/u/<id>, 관리자 /admin/<id>). 서버 api/_units.js에도 같은 id가 있어야 한다.
//       'link'  = 따로 배포된 수업 자료로 가는 바로가기
//       'soon'  = 준비 중(카드만 보임)
// key: 브라우저 저장 이름 앞머리. 삼각형과 평행선은 예전 이름(tp)을 그대로 써서 풀던 기록이 이어진다.
window.SITE = {
  title: '이송원 선생님의 중학교 2학년 닮음 탐구 교실',
  short: '닮음 탐구 교실',
};

window.UNIT_LIST = [
  {
    id: 'triangle-parallel', kind: 'quiz', key: 'tp', icon: '📐',
    title: '삼각형과 평행선',
    desc: '단계형 10문제 · 단답형 10문제 · 피드백 문제 · 사과나무',
  },
  { id: 'centroid', kind: 'soon', icon: '⚖️', title: '삼각형의 무게중심', desc: '준비 중이에요' },
  { id: 'games', kind: 'soon', icon: '🎮', title: '닮음 게임', desc: '짝맞추기 · 버블 게임 — 준비 중이에요' },
  { id: 'lesson', kind: 'link', icon: '🔍', title: '도형의 닮음 (수업 화면)', desc: '닮음이란? · 닮음비 · 넓이비 · 부피비 · 짝맞추기', url: 'https://similar-lesson.vercel.app' },
  { id: 'right-triangle', kind: 'link', icon: '📏', title: '직각삼각형의 닮음', desc: '수선의 발 문제', url: 'https://right-triangle-similarity.vercel.app' },
];

// /u/<id> 또는 /admin/<id> 주소에서 지금 유닛을 찾는다.
window.unitFromPath = function () {
  const m = /^\/(?:u|admin)\/([a-z0-9-]+)\/?$/.exec(location.pathname);
  const u = m && window.UNIT_LIST.find((x) => x.id === m[1] && x.kind === 'quiz');
  return u || null;
};

// 유닛 페이지가 쓸 스크립트를 순서대로 불러온다.
window.loadScripts = function (list) {
  return list.reduce((p, src) => p.then(() => new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = () => fail(new Error(src));
    document.body.appendChild(s);
  })), Promise.resolve());
};
