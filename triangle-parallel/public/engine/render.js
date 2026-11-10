// 공통 엔진: 빈칸 수 세기, 수식 표기, 그림 그리기. 그림 좌표는 유닛 데이터의 window.FIGS.
(function () {
  // 빈칸 목록(문제마다 입력 칸 순서)
  window.blankCount = (p) => (p.steps ? p.steps.reduce((t, s) => t + s.eq.split('@').length - 1, 0) : p.blanks.length);

  // ---- 수식 표기 ----
  const PAR = '<svg class="par" viewBox="0 0 14 20" aria-label="평행"><path d="M6 1 L1 19 M13 1 L8 19" stroke="currentColor" stroke-width="1.7" fill="none"/></svg>';
  window.mathHtml = function (s) {
    return s
      .replace(/\[([A-Z]{2})\]/g, '<span class="seg">$1</span>')
      .replace(/\{([a-z])\}/g, '<i class="v">$1</i>')
      .replace(/(^|[^A-Za-z<>"/])([A-Z]{1,4})(?![A-Za-z<"])/g, '$1<span class="pt">$2</span>')
      .replace(/(\d+) cm/g, '<span class="pt">$1&nbsp;cm</span>')
      .replace(/\|\|/g, PAR);
  };

  // ---- 그림 그리기 ----
  const ink = '#1c2230', dim = '#4b5568', paper = '#ffffff';
  const fmt = (n) => Math.round(n * 10) / 10;

  function draw(sp) {
    const fs = sp.fs || 40;
    const P = (p) => (typeof p === 'string' ? sp.pts[p] : p);
    const parts = [];
    const thick = fs * 0.085, thin = fs * 0.05, dash = fs * 0.04;

    (sp.polys || []).forEach(([pts, fill]) => {
      parts.push(`<polygon points="${pts.map((p) => P(p).map(fmt).join(',')).join(' ')}" fill="${fill}"/>`);
    });
    (sp.angs || []).forEach(([v, a, b, r, fill]) => {
      const c = P(v), u = P(a), w = P(b);
      const unit = (q) => { const dx = q[0] - c[0], dy = q[1] - c[1], l = Math.hypot(dx, dy); return [dx / l, dy / l]; };
      const s = unit(u), t = unit(w);
      const x0 = c[0] + s[0] * r, y0 = c[1] + s[1] * r, x1 = c[0] + t[0] * r, y1 = c[1] + t[1] * r;
      const sweep = s[0] * t[1] - s[1] * t[0] > 0 ? 1 : 0;
      if (fill) parts.push(`<path d="M${fmt(c[0])} ${fmt(c[1])} L${fmt(x0)} ${fmt(y0)} A${r} ${r} 0 0 ${sweep} ${fmt(x1)} ${fmt(y1)} Z" fill="${fill}"/>`);
      parts.push(`<path d="M${fmt(x0)} ${fmt(y0)} A${r} ${r} 0 0 ${sweep} ${fmt(x1)} ${fmt(y1)}" fill="none" stroke="${ink}" stroke-width="${fmt(thin)}"/>`);
    });
    (sp.lines || []).forEach(([a, b, w]) => {
      const p = P(a), q = P(b);
      parts.push(`<line x1="${fmt(p[0])}" y1="${fmt(p[1])}" x2="${fmt(q[0])}" y2="${fmt(q[1])}" stroke="${ink}" stroke-width="${fmt(w === 0 ? thin : thick)}" stroke-linecap="round"/>`);
    });

    const labels = [];
    const addText = (x, y, text) => {
      const m = /^([a-z])( cm)?$/.exec(text);
      const body = m ? `<tspan font-style="italic">${m[1]}</tspan>${m[2] || ''}` : text;
      labels.push(`<text x="${fmt(x)}" y="${fmt(y)}" class="dl">${body}</text>`);
    };
    (sp.dims || []).forEach(([a, b, text, pass, o = {}]) => {
      const p = P(a), q = P(b);
      const cx = 2 * pass[0] - (p[0] + q[0]) / 2, cy = 2 * pass[1] - (p[1] + q[1]) / 2;
      parts.push(`<path d="M${fmt(p[0])} ${fmt(p[1])} Q${fmt(cx)} ${fmt(cy)} ${fmt(q[0])} ${fmt(q[1])}" fill="none" stroke="${dim}" stroke-width="${fmt(dash)}" stroke-dasharray="${fmt(fs * 0.17)} ${fmt(fs * 0.13)}"/>`);
      if (o.call) {
        const t = o.t ?? 0.5;
        const tip = [
          (1 - t) * (1 - t) * p[0] + 2 * t * (1 - t) * cx + t * t * q[0],
          (1 - t) * (1 - t) * p[1] + 2 * t * (1 - t) * cy + t * t * q[1],
        ];
        const from = o.from || [o.call[0], o.call[1] + fs * 0.5];
        const ctrl = o.bend || [(from[0] + tip[0]) / 2 - fs * 0.25, (from[1] + tip[1]) / 2 + fs * 0.2];
        parts.push(`<path d="M${fmt(from[0])} ${fmt(from[1])} Q${fmt(ctrl[0])} ${fmt(ctrl[1])} ${fmt(tip[0])} ${fmt(tip[1])}" fill="none" stroke="${ink}" stroke-width="${fmt(dash)}"/>`);
        parts.push(head(tip, [tip[0] - ctrl[0], tip[1] - ctrl[1]], fs * 0.26, ink));
        addText(o.call[0], o.call[1], text);
      } else {
        const l = o.lab || pass;
        addText(l[0], l[1], text);
      }
    });

    (sp.arrows || []).forEach(([a, b, t = 0.5]) => {
      const p = P(a), q = P(b);
      parts.push(head([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t], [q[0] - p[0], q[1] - p[1]], fs * 0.36, ink));
    });
    (sp.ticks || []).forEach(([a, b, kind]) => {
      const p = P(a), q = P(b);
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const ux = (q[0] - p[0]) / l, uy = (q[1] - p[1]) / l, nx = -uy, ny = ux, s = fs * 0.24;
      const tick = (off) => {
        const x = mx + ux * off, y = my + uy * off;
        parts.push(`<line x1="${fmt(x - nx * s)}" y1="${fmt(y - ny * s)}" x2="${fmt(x + nx * s)}" y2="${fmt(y + ny * s)}" stroke="${ink}" stroke-width="${fmt(thin)}"/>`);
      };
      if (kind === 1) tick(0);
      else if (kind === 2) { tick(-fs * 0.1); tick(fs * 0.1); }
      else if (kind === 'o') parts.push(`<circle cx="${fmt(mx)}" cy="${fmt(my)}" r="${fmt(fs * 0.17)}" fill="${paper}" stroke="${ink}" stroke-width="${fmt(thin)}"/>`);
      else if (kind === 'x') {
        const d = fs * 0.17;
        parts.push(`<path d="M${fmt(mx - d)} ${fmt(my - d)} L${fmt(mx + d)} ${fmt(my + d)} M${fmt(mx + d)} ${fmt(my - d)} L${fmt(mx - d)} ${fmt(my + d)}" stroke="${ink}" stroke-width="${fmt(thin)}"/>`);
      }
    });
    (sp.ptrs || []).forEach(([from, to]) => {
      const c = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 - fs * 0.1];
      parts.push(`<path d="M${fmt(from[0])} ${fmt(from[1])} Q${fmt(c[0])} ${fmt(c[1])} ${fmt(to[0])} ${fmt(to[1])}" fill="none" stroke="${ink}" stroke-width="${fmt(dash)}"/>`);
      parts.push(head(to, [to[0] - c[0], to[1] - c[1]], fs * 0.26, ink));
    });
    Object.entries(sp.names || {}).forEach(([n, [x, y]]) => labels.push(`<text x="${fmt(x)}" y="${fmt(y)}" class="pl">${n}</text>`));
    Object.entries(sp.vars || {}).forEach(([n, [x, y]]) => labels.push(`<text x="${fmt(x)}" y="${fmt(y)}" class="pl" font-style="italic">${n}</text>`));
    (sp.texts || []).forEach(([x, y, t]) => labels.push(`<text x="${fmt(x)}" y="${fmt(y)}" class="dl">${t}</text>`));

    const [x, y, w, h] = sp.vb;
    return `<svg viewBox="${x} ${y} ${w} ${h}" role="img" aria-label="문제 그림" style="--fs:${fs}px;--halo:${fmt(fs * 0.2)}px">${parts.join('')}${labels.join('')}</svg>`;
  }

  function head(at, dir, size, color) {
    const l = Math.hypot(dir[0], dir[1]) || 1;
    const ux = dir[0] / l, uy = dir[1] / l, nx = -uy, ny = ux;
    const b = [at[0] - ux * size, at[1] - uy * size];
    const w = size * 0.42, n = size * 0.72;
    const notch = [at[0] - ux * n, at[1] - uy * n];
    const pts = [at, [b[0] + nx * w, b[1] + ny * w], notch, [b[0] - nx * w, b[1] - ny * w]];
    return `<polygon points="${pts.map((p) => p.map(fmt).join(',')).join(' ')}" fill="${color}"/>`;
  }


  window.figureSvg = (id) => (window.FIGS && window.FIGS[id] ? draw(window.FIGS[id]) : '');
})();
