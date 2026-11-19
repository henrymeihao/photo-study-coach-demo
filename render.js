const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clamp = (n) => Math.min(1, Math.max(0, Number(n) || 0));
const SVG = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// Photo annotations. The viewBox matches the photo's aspect ratio so strokes and arrowheads keep their shape.
export function drawMarks(svg, labels, items, aspect) {
  const W = 1000;
  const H = Math.round(W / aspect);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = '<defs><marker id="head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="currentColor"/></marker></defs>';
  labels.innerHTML = '';
  const P = ([x, y]) => [clamp(x) * W, clamp(y) * H];

  items.forEach((m, i) => {
    const g = el('g', { class: `mark ${m.inferred ? 'inferred' : ''}`, 'data-mark': i, style: `--d:${i * 0.35}s` });
    let anchor;
    if (m.kind === 'box' && m.box?.length === 4) {
      const [x0, y0] = P(m.box.slice(0, 2));
      const [x1, y1] = P(m.box.slice(2));
      g.append(el('rect', { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0), rx: 10, pathLength: 1 }));
      anchor = [Math.min(x0, x1), Math.min(y0, y1)];
    } else if (m.kind === 'line' && m.points?.length >= 2) {
      const pts = m.points.map(P);
      g.append(el('polyline', { points: pts.map((p) => p.join(',')).join(' '), pathLength: 1 }));
      const [a, b] = [pts[Math.floor((pts.length - 1) / 2)], pts[Math.ceil((pts.length - 1) / 2)]];
      anchor = pts.length === 2 ? [(pts[0][0] * 2 + pts[1][0]) / 3, (pts[0][1] * 2 + pts[1][1]) / 3] : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    } else if (m.kind === 'arrow' && m.from && m.to) {
      const [a, b] = [P(m.from), P(m.to)];
      g.append(el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], pathLength: 1, 'marker-end': 'url(#head)' }));
      anchor = a;
    } else if (m.kind === 'point' && m.at) {
      const [x, y] = P(m.at);
      g.append(el('circle', { cx: x, cy: y, r: 14, pathLength: 1 }), el('circle', { cx: x, cy: y, r: 4, class: 'dot' }));
      anchor = [x, y];
    } else return;
    svg.append(g);

    const tag = document.createElement('span');
    // Keep labels inside the frame: flip left near the right edge, drop below near the top edge.
    const flipX = anchor[0] > W * 0.68 ? 'flip-x' : '';
    const flipY = anchor[1] < H * 0.1 ? 'flip-y' : '';
    tag.className = `tag ${m.inferred ? 'inferred' : ''} ${flipX} ${flipY}`;
    tag.dataset.mark = i;
    tag.style.left = `${(anchor[0] / W) * 100}%`;
    tag.style.top = `${(anchor[1] / H) * 100}%`;
    tag.style.setProperty('--d', `${i * 0.35 + 0.3}s`);
    tag.innerHTML = `<b>${i + 1}</b>${esc(m.label)}`;
    labels.append(tag);
  });
  requestAnimationFrame(() => separateTags(labels));
}

// Nudge overlapping labels apart vertically, in mark order, so every label stays readable.
function separateTags(labels) {
  const box = labels.getBoundingClientRect();
  const done = [];
  for (const tag of labels.children) {
    let r = tag.getBoundingClientRect();
    let shift = 0;
    for (let tries = 0; tries < 8; tries++) {
      const hit = done.find((o) => r.left < o.right && r.right > o.left && r.top < o.bottom + 3 && r.bottom > o.top - 3);
      if (!hit) break;
      const down = hit.bottom + 4 - r.top;
      const up = r.bottom - (hit.top - 4);
      const step = r.top + down + r.height < box.bottom ? down : -up;
      shift += step;
      r = new DOMRect(r.x, r.y + step, r.width, r.height);
    }
    if (shift) tag.style.marginTop = `${shift}px`;
    done.push(r);
  }
}

// Top-down light plan: subject in the middle, camera at the bottom, lights placed by azimuth.
export function drawSetup(container, setup, t) {
  const lights = Array.isArray(setup?.lights) ? setup.lights : [];
  if (!lights.length) return (container.hidden = true);
  const cx = 160, cy = 118, r = 84;
  const rad = (d) => ((Number(d) || 0) * Math.PI) / 180;
  const face = rad(setup.subjectFacing);
  const lightSvg = lights.map((l, i) => {
    // A top light sits above the subject; drawing it on the orbit would misplace it next to the camera.
    const top = l.height === 'top';
    const x = top ? cx + 56 : cx + r * Math.sin(rad(l.azimuth));
    const y = top ? cy - 56 : cy + r * Math.cos(rad(l.azimuth));
    const ex = top ? cx + 16 : cx + 30 * Math.sin(rad(l.azimuth));
    const ey = top ? cy - 16 : cy + 30 * Math.cos(rad(l.azimuth));
    const dash = l.inferred !== false ? 'stroke-dasharray="6 6"' : '';
    return `<g class="lamp" style="--d:${i * 0.3}s">
      <line x1="${x}" y1="${y}" x2="${ex}" y2="${ey}" ${dash} marker-end="url(#ray)"/>
      <circle cx="${x}" cy="${y}" r="13"/>
      <text x="${x}" y="${y + 4}" class="sun">☀</text>
      <text x="${x}" y="${y > cy ? y + 30 : y - 20}" class="cap">${esc(l.label)}${t.heights[l.height] ? ' · ' + t.heights[l.height] : ''}</text>
    </g>`;
  }).join('');
  container.innerHTML = `<div class="setup-head"><b>${t.setupTitle}</b><span>${t.setupNote}</span></div>
  <svg viewBox="0 0 320 250" role="img" aria-label="${t.setupTitle}">
    <defs><marker id="ray" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z"/></marker></defs>
    <circle cx="${cx}" cy="${cy}" r="${r}" class="orbit"/>
    <g class="subject"><circle cx="${cx}" cy="${cy}" r="16"/><line x1="${cx}" y1="${cy}" x2="${cx + 28 * Math.sin(face)}" y2="${cy + 28 * Math.cos(face)}"/></g>
    <text x="${cx}" y="${cy - 24}" class="cap">${t.subject}</text>
    <g class="cam"><rect x="${cx - 16}" y="232" width="32" height="14" rx="3"/><path d="M${cx - 7} 232 L${cx} 222 L${cx + 7} 232"/></g>
    <text x="${cx + 28}" y="243" class="cap left">${t.camera}</text>
    ${lightSvg}
  </svg>`;
  container.hidden = false;
}

const row = (k, v) => (v ? `<div class="kv"><dt>${k}</dt><dd>${esc(v)}</dd></div>` : '');
const badge = (level, t) => (level ? `<span class="lvl lvl-${esc(level)}">${t.level[level] || esc(level)}</span>` : '');

// One renderer per NDJSON line type. Each returns the HTML of a card section.
export const SECTIONS = {
  seen: (d, t) => `<section class="sec seen"><h3>${t.seen}</h3><p class="big">${esc(d.text)}</p><p class="note">${t.seenCheck}</p>${d.intent ? `<p class="intent-line">${esc(d.intent)}</p>` : ''}</section>`,
  lesson: (d, t) => `<section class="sec lesson"><h3>${t.lesson} ${badge(d.level, t)}</h3><p class="headline">${esc(d.title)}</p><p>${esc(d.why)}</p></section>`,
  evidence: (d, t) => `<section class="sec"><h3>${t.evidence}</h3><ul class="evidence">${(d.items || []).map((e) => `<li data-mark="${Number(e.mark)}"><b>${Number(e.mark) + 1}</b><div><strong>${esc(e.where)}</strong><span>${esc(e.effect)}</span></div></li>`).join('')}</ul></section>`,
  light: (d, t) => `<section class="sec"><h3>${t.light} ${badge(d.level, t)}</h3><p>${esc(d.summary)}</p>
    <div class="chips"><span>${t.lightDir}<b>${esc(d.direction)}</b></span><span>${t.lightQuality}<b>${t.quality[d.quality] || esc(d.quality)}</b></span><span>${t.lightContrast}<b>${t.contrast[d.contrast] || esc(d.contrast)}</b></span></div>
    <ul class="dots">${(d.cues || []).map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
    <dl>${row(t.planA, d.planA)}${row(t.planB, d.planB)}${row(t.test, d.test)}</dl><div class="setup" data-setup hidden></div></section>`,
  composition: (d, t) => `<section class="sec"><h3>${t.composition}</h3><p>${esc(d.summary)}</p><dl>${row(t.viewpoint, d.viewpoint)}</dl><ol class="path">${(d.order || []).map((o) => `<li>${esc(o)}</li>`).join('')}</ol></section>`,
  steps: (d, t) => `<section class="sec recipe"><h3>${t.recipe}</h3><ol class="four">${t.fourSteps.map(([k, f], i) => `<li><span>${i + 1}</span><div><b>${k}</b><p>${esc(d[f])}</p></div></li>`).join('')}</ol></section>`,
  counter: (d, t) => `<section class="sec"><h3>${t.counter} <span class="lvl lvl-C">${t.counterNote}</span></h3><dl>${row(t.fixed, d.fixed)}${row(t.change, d.change)}${row(t.expect, d.expect)}</dl><div class="tradeoff"><div class="gain"><b>${t.gain}</b>${esc(d.gain)}</div><div class="lose"><b>${t.lose}</b>${esc(d.lose)}</div></div></section>`,
  practice: (d, t) => `<section class="sec"><h3>${t.practice}</h3><p class="muted">${t.prep}${t.colon}${esc(d.prep)}</p><div class="ab"><div><b>A</b><p>${esc(d.a)}</p></div><div><b>B</b><p>${esc(d.b)}</p></div></div><p class="check">✓ ${esc(d.check)}</p></section>`,
  scenes: (d, t) => `<section class="sec"><h3>${t.scenes}</h3>${(d.items || []).map((s) => `<div class="scene"><b>${esc(s.scene)}</b><p>${esc(s.how)}</p><p class="fit">${t.fits}${t.colon}${esc(s.fits)}</p><p class="nofit">${t.notFits}${t.colon}${esc(s.not)}</p></div>`).join('')}</section>`,
  deep: (d, t) => `<details class="sec deep"><summary>${t.deep}</summary><h4>${t.candidates}</h4><ul class="dots">${(d.candidates || []).map((c) => `<li>${esc(c)}</li>`).join('')}</ul><h4>${t.unknowns}</h4><ul class="dots">${(d.unknowns || []).map((c) => `<li>${esc(c)}</li>`).join('')}</ul><h4>${t.known}</h4><p>${esc(d.known)}</p></details>`,
};

export { esc };
