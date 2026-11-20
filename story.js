// Explainer video: one numbered point per screen, built from a saved analysis. ?sample=<id>&lang=zh|en&slow=N
import { STRINGS } from './i18n.js';
import { drawMarks, drawSetup, esc } from './render.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const lang = params.get('lang') === 'en' ? 'en' : 'zh';
const id = params.get('sample') || '65';
const SLOW = Math.min(8, Math.max(1, Number(params.get('slow')) || 1));
const t = STRINGS[lang];
const s = t.story;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * SLOW));
if (SLOW > 1) {
  const slowAll = () => { for (const a of document.getAnimations()) if (a.playbackRate !== 1 / SLOW) a.playbackRate = 1 / SLOW; requestAnimationFrame(slowAll); };
  requestAnimationFrame(slowAll);
}
document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';

const lines = await fetch(`data/${id}-${lang}.json`).then((r) => r.json());
const d = Object.fromEntries(lines.map((l) => [l.t, l]));
const img = $('#photo');
img.src = `samples/s${id}.jpg`;
await img.decode();
const aspect = img.naturalWidth / img.naturalHeight;
$('#stage').style.setProperty('--ar', String(aspect));

// keep: leave the cover up (the closing screen should be the last frame of the video).
const cover = async (html, ms, { keep = false } = {}) => {
  $('#cover').innerHTML = html;
  $('#cover').classList.add('show');
  await sleep(ms);
  if (keep) return;
  $('#cover').classList.remove('show');
  await sleep(600);
};
const point = async (n, [title, sub], panel) => {
  document.body.classList.add('swap');
  await sleep(350);
  $('#num').textContent = n;
  $('#title').textContent = title;
  $('#sub').textContent = sub;
  $('#panel').innerHTML = panel;
  document.body.classList.remove('swap');
};
const marks = (on) => $('#stage').classList.toggle('hide-marks', !on);
const highlight = (i) => {
  document.querySelectorAll('[data-mark]').forEach((n) => n.classList.toggle('hl', n.dataset.mark === String(i)));
  $('#stage').classList.toggle('focus', i !== null);
};
const level = (l) => (l ? `<span class="lvl lvl-${esc(l)}">${t.level[l] || esc(l)}</span>` : '');
// Portrait screens drop the longest lines so the card fits above the app's bottom overlay.
const PORTRAIT = matchMedia('(max-aspect-ratio: 1/1)').matches;

await cover(`<div class="st-hook"><h1>${s.hook}</h1><p>${s.hookSub}</p></div>`, 3200);

marks(false);
await point('1', s.c1, `<p class="st-label">${t.seen}</p><blockquote>${esc(d.seen.text)}</blockquote><p class="st-note">${t.seenCheck}</p>`);
await sleep(5200);

drawMarks($('#overlay'), $('#labels'), d.marks.items || [], aspect);
await point('2', s.c2, `<p class="st-label">${t.lesson} ${level(d.lesson.level)}</p><p class="st-lesson">${esc(d.lesson.title)}</p><p class="st-why">${esc(d.lesson.why)}</p>`);
marks(true);
await sleep(5200);

await point('3', s.c3, '<div id="ev"></div>');
for (const e of (d.evidence.items || []).slice(0, 3)) {
  highlight(Number(e.mark));
  $('#ev').innerHTML = `<div class="st-ev"><b>${Number(e.mark) + 1}</b><div><strong>${esc(e.where)}</strong><p>${esc(e.effect)}</p></div></div>`;
  await sleep(2400);
}
highlight(null);

marks(false);
const dirChip = PORTRAIT ? '' : `<span>${t.lightDir}<b>${esc(d.light.direction)}</b></span>`;
await point('4', s.c4, `<p class="st-why">${esc(d.light.summary)}</p><div class="chips">${dirChip}<span>${t.lightQuality}<b>${t.quality[d.light.quality] || esc(d.light.quality)}</b></span><span>${t.lightContrast}<b>${t.contrast[d.light.contrast] || esc(d.light.contrast)}</b></span></div><div class="setup" data-setup hidden></div>`);
drawSetup($('[data-setup]'), d.light.setup, t);
await sleep(5600);

marks(false);
await point('5', s.c5, `<ol class="four">${t.fourSteps.map(([k, f], i) => `<li><span>${i + 1}</span><div><b>${k}</b><p>${esc(d.steps[f])}</p></div></li>`).join('')}</ol>`);
await sleep(7000);

const changeLine = PORTRAIT ? '' : `<p class="st-label">${t.change}</p><p class="st-why">${esc(d.counter.change)}</p>`;
await point('6', s.c6, `${changeLine}<div class="ab"><div><b>A</b><p>${esc(d.practice.a)}</p></div><div><b>B</b><p>${esc(d.practice.b)}</p></div></div><p class="check">✓ ${esc(d.practice.check)}</p>`);
await sleep(6400);

await cover(`<div class="st-hook outro"><h1>${s.outro}</h1>${s.how.map((h) => `<p class="how">${h}</p>`).join('')}</div>`, 5600, { keep: true });
document.body.classList.add('demo-done');
