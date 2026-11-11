// 삼각 친구 캐릭터와 아이템(평행선 던전 탐험, 게임 랭킹에서 함께 쓴다)
// AVATAR.svg({shape, color, face, head, face2?, body, pet}, 크기) → 캐릭터 SVG 문자열
// 아이템 목록은 api/_dungeon.js의 TOOLS·COSMETICS와 같은 이름을 쓴다.
window.AVATAR = (function () {
  const SHAPES = {
    eq: { name: '정삼각형', pts: [[50, 20], [14, 86], [86, 86]], face: [50, 63] },
    right: { name: '직각삼각형', pts: [[22, 18], [22, 86], [86, 86]], face: [41, 64] },
    iso: { name: '이등변삼각형', pts: [[50, 8], [26, 86], [74, 86]], face: [50, 62] },
    obtuse: { name: '둔각삼각형', pts: [[66, 34], [6, 86], [94, 86]], face: [56, 68] },
  };
  const COLORS = ['#ff8a80', '#ffb74d', '#ffe066', '#7ed58b', '#7fb2ff', '#c39bf0'];
  const FACES = { smile: '웃음', brave: '씩씩', sleepy: '졸림', wow: '놀람' };
  const TOOLS = {
    lens: { icon: '🔍', name: '돋보기', desc: '대응하는 선분을 색으로 짝지어 보여 주고 비례식을 알려 줘요.' },
    scissors: { icon: '✂️', name: '반반 가위', desc: '틀린 답 2개를 지워 줘요.' },
    shield: { icon: '🛡️', name: '방패', desc: '틀렸을 때 하트가 줄지 않게 막아 줘요. (저절로 써져요)' },
    potion: { icon: '🧪', name: '물약', desc: '하트를 1개 채워 줘요.' },
  };
  const COSMETICS = {
    cap: { icon: '🧢', name: '야구 모자', slot: 'head', price: 3 },
    ribbon: { icon: '🎀', name: '리본', slot: 'head', price: 3 },
    tophat: { icon: '🎩', name: '신사 모자', slot: 'head', price: 5 },
    helmet: { icon: '⛑️', name: '탐험 헬멧', slot: 'head', price: 5 },
    crown: { icon: '👑', name: '왕관', slot: 'head', rare: true },
    glasses: { icon: '👓', name: '안경', slot: 'face', price: 3 },
    sunglasses: { icon: '🕶️', name: '선글라스', slot: 'face', price: 5 },
    disguise: { icon: '🥸', name: '변장 안경', slot: 'face', price: 5 },
    scarf: { icon: '🧣', name: '목도리', slot: 'body', price: 3 },
    star: { icon: '⭐', name: '별 배지', slot: 'body', price: 3 },
    medal: { icon: '🎖️', name: '훈장', slot: 'body', price: 5 },
    chick: { icon: '🐣', name: '병아리', slot: 'pet', price: 5 },
    turtle: { icon: '🐢', name: '거북이', slot: 'pet', price: 5 },
    owl: { icon: '🦉', name: '부엉이', slot: 'pet', price: 8 },
    cat: { icon: '🐱', name: '고양이', slot: 'pet', price: 8 },
    dragon: { icon: '🐲', name: '꼬마 용', slot: 'pet', rare: true },
  };
  const SLOTS = { head: '머리', face: '얼굴', body: '몸', pet: '펫' };

  function faceSvg(kind, x, y) {
    const eye = (dx) => `<circle cx="${x + dx}" cy="${y}" r="3.6" fill="#1c2230"/>`;
    if (kind === 'sleepy') {
      return `<path d="M${x - 11} ${y} q4 3 8 0 M${x + 3} ${y} q4 3 8 0" stroke="#1c2230" stroke-width="2.4" fill="none" stroke-linecap="round"/>
        <path d="M${x - 4} ${y + 9} h8" stroke="#1c2230" stroke-width="2.4" stroke-linecap="round"/>`;
    }
    if (kind === 'wow') {
      return `<circle cx="${x - 7}" cy="${y}" r="4.6" fill="#fff" stroke="#1c2230" stroke-width="2"/><circle cx="${x + 7}" cy="${y}" r="4.6" fill="#fff" stroke="#1c2230" stroke-width="2"/>
        <circle cx="${x - 7}" cy="${y}" r="2" fill="#1c2230"/><circle cx="${x + 7}" cy="${y}" r="2" fill="#1c2230"/><ellipse cx="${x}" cy="${y + 11}" rx="3.4" ry="4.2" fill="#1c2230"/>`;
    }
    const brows = kind === 'brave' ? `<path d="M${x - 11} ${y - 7} l7 3 M${x + 11} ${y - 7} l-7 3" stroke="#1c2230" stroke-width="2.4" stroke-linecap="round"/>` : '';
    const mouth = kind === 'brave'
      ? `<path d="M${x - 5} ${y + 9} h10" stroke="#1c2230" stroke-width="2.6" stroke-linecap="round"/>`
      : `<path d="M${x - 6} ${y + 7} q6 6 12 0" stroke="#1c2230" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    return `${eye(-7)}${eye(7)}${brows}${mouth}<circle cx="${x - 12}" cy="${y + 6}" r="3" fill="#ff6b8a" opacity=".35"/><circle cx="${x + 12}" cy="${y + 6}" r="3" fill="#ff6b8a" opacity=".35"/>`;
  }

  // av: {shape, color, face(표정), head, faceItem(얼굴 자리 꾸미기), body, pet}
  function svg(av, size) {
    const a = av || {};
    const sh = SHAPES[a.shape] || SHAPES.eq;
    const col = COLORS[a.color] ?? COLORS[0];
    const [fx, fy] = sh.face;
    const top = sh.pts.reduce((m, p) => (p[1] < m[1] ? p : m), sh.pts[0]);
    const em = (id, x, y, s) => (id && COSMETICS[id] ? `<text x="${x}" y="${y}" font-size="${s}" text-anchor="middle" dominant-baseline="central">${COSMETICS[id].icon}</text>` : '');
    const faceItem = a.faceItem !== undefined ? a.faceItem : null;
    return `<svg viewBox="0 0 120 108" width="${size || 96}" height="${Math.round((size || 96) * 0.9)}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="50" cy="100" rx="34" ry="5" fill="rgba(0,0,0,.12)"/>
      <path d="M38 86 v10 M62 86 v10" stroke="#1c2230" stroke-width="4" stroke-linecap="round"/>
      <polygon points="${sh.pts.map((p) => p.join(',')).join(' ')}" fill="${col}" stroke="#1c2230" stroke-width="3.4" stroke-linejoin="round"/>
      ${faceSvg(FACES[a.face] ? a.face : 'smile', fx, fy)}
      ${em(faceItem, fx, fy + 1, 24)}
      ${em(a.body, fx, 80, 16)}
      ${em(a.head, top[0], top[1] - 6, 26)}
      ${em(a.pet, 106, 90, 24)}
    </svg>`;
  }
  // 서버 프로필({char, wear}) → svg에 넣을 모양
  const fromProfile = (p) => (p && p.char ? { ...p.char, head: p.wear?.head, faceItem: p.wear?.face, body: p.wear?.body, pet: p.wear?.pet } : null);
  // 랭킹용 작은 모양(서버 'avatar' 저장 값과 같은 꼴)
  const fromStored = (s) => s || null;

  return { SHAPES, COLORS, FACES, TOOLS, COSMETICS, SLOTS, svg, fromProfile, fromStored };
})();
