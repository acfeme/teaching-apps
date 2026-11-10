// 맞힌 문제 수(0~20)에 따라 씨앗 → 새싹 → 모종 → 어린 나무 → 꽃 핀 나무 → 사과나무
(function () {
  const MAX = 20;
  const CANOPY = [[0, 0, 1], [-0.55, 0.18, 0.78], [0.55, 0.18, 0.78], [-0.3, -0.42, 0.72], [0.3, -0.42, 0.72], [0, 0.4, 0.72]];
  const GREENS = ['#4f9a3c', '#5fae47', '#57a541', '#4a9137', '#66b34e', '#4f9a3c'];
  const SPOTS = [[-0.45, -0.1], [0.42, -0.22], [0.05, 0.22], [-0.2, -0.55], [0.62, 0.28], [-0.66, 0.32], [0.24, -0.62], [-0.05, -0.25],
    [0.3, 0.45], [-0.35, 0.5], [0.7, -0.05], [-0.72, -0.05]];

  function name(n) {
    if (n <= 0) return '씨앗';
    if (n <= 2) return '새싹';
    if (n <= 5) return '모종';
    if (n <= 9) return '어린 나무';
    if (n <= 13) return '쑥쑥 자라는 나무';
    if (n <= 16) return '꽃이 핀 나무';
    return '사과나무';
  }

  function svg(nRaw) {
    const n = Math.max(0, Math.min(MAX, Math.round(nRaw || 0)));
    const p = [];
    p.push('<circle cx="100" cy="108" r="98" fill="#eef7e6"/>');
    p.push('<ellipse cx="100" cy="201" rx="80" ry="13" fill="#9b7448"/><ellipse cx="100" cy="196" rx="72" ry="8" fill="#80b865"/>');

    if (n === 0) {
      p.push('<ellipse cx="100" cy="193" rx="10" ry="6.5" fill="#7a4e2a"/><path d="M95 190 q5 -4 10 0" stroke="#a87545" stroke-width="1.6" fill="none"/>');
    } else if (n <= 5) {
      const h = n <= 2 ? 14 + 10 * n : 34 + 12 * (n - 2);
      const top = 194 - h;
      p.push(`<path d="M100 195 Q96 ${194 - h / 2} 100 ${top}" stroke="#4f9a3c" stroke-width="4" fill="none" stroke-linecap="round"/>`);
      const pairs = n <= 2 ? 1 : n - 1;
      for (let i = 0; i < pairs; i++) {
        const y = top + 4 + (i * (h - 16)) / Math.max(1, pairs);
        const s = 11 - i * 0.6;
        p.push(`<ellipse class="leaf" cx="${100 - s}" cy="${y}" rx="${s}" ry="${s * 0.45}" fill="#5fae47" transform="rotate(-25 ${100 - s} ${y})"/>`);
        p.push(`<ellipse class="leaf" cx="${100 + s}" cy="${y + 3}" rx="${s}" ry="${s * 0.45}" fill="#4f9a3c" transform="rotate(25 ${100 + s} ${y + 3})"/>`);
      }
    } else {
      const g = (n - 6) / 14;
      const h = 72 + 52 * g;
      const top = 196 - h;
      const w = 6 + 8 * g;
      const r = 30 + 36 * g;
      const cy = top + 4;
      p.push(`<path d="M${100 - w} 197 L${100 - w * 0.45} ${top + 12} L${100 + w * 0.45} ${top + 12} L${100 + w} 197 Z" fill="#7a5230"/>`);
      p.push(`<path d="M100 ${top + h * 0.45} L${100 - r * 0.5} ${cy + r * 0.2} M100 ${top + h * 0.38} L${100 + r * 0.5} ${cy + r * 0.15}" stroke="#7a5230" stroke-width="${2 + 3 * g}" stroke-linecap="round"/>`);
      CANOPY.forEach(([dx, dy, f], i) => {
        p.push(`<circle cx="${100 + dx * r}" cy="${cy + dy * r}" r="${f * r * 0.7}" fill="${GREENS[i]}"/>`);
      });
      const blossoms = n >= 17 ? 4 : n >= 14 ? (n - 13) * 4 : 0;
      for (let i = 0; i < blossoms; i++) {
        const [dx, dy] = SPOTS[(i * 5) % SPOTS.length];
        const x = 100 + dx * r * 0.95 + 4, y = cy + dy * r * 0.95 - 3;
        p.push(`<g class="pop"><circle cx="${x}" cy="${y}" r="3.6" fill="#ffd6e3"/><circle cx="${x}" cy="${y}" r="1.4" fill="#f6b73c"/></g>`);
      }
      const apples = n >= 17 ? (n - 16) * 2 : 0;
      for (let i = 0; i < apples; i++) {
        const [dx, dy] = SPOTS[i];
        const x = 100 + dx * r, y = cy + dy * r;
        p.push(`<g class="pop"><path d="M${x} ${y - 6} q1 -4 4 -5" stroke="#6b4a2b" stroke-width="1.4" fill="none"/><circle cx="${x}" cy="${y}" r="6.5" fill="#d83a2e"/><circle cx="${x - 2.2}" cy="${y - 2.2}" r="1.8" fill="#ff8a7a"/></g>`);
      }
    }
    return `<svg viewBox="0 0 200 214" class="tree-svg" role="img" aria-label="${name(n)}">${p.join('')}</svg>`;
  }

  window.TREE_MAX = MAX;
  window.treeSvg = svg;
  window.treeName = name;
})();
