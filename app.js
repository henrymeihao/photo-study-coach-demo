import { STRINGS } from './i18n.js';
import { drawMarks, drawSetup, SECTIONS, esc } from './render.js';

const $ = (s) => document.querySelector(s);
const ORDER = ['seen', 'lesson', 'evidence', 'light', 'composition', 'steps', 'counter', 'practice', 'scenes', 'deep'];
const STAGE_OF = { seen: 0, lesson: 1, marks: 2, evidence: 2, light: 3, steps: 4, practice: 4 };
const MAX_EDGE = 1600;
const PARAMS = new URLSearchParams(location.search);
// Static build (GitHub Pages): no server, samples replay pre-computed analyses from data/.
const STATIC = document.documentElement.dataset.mode === 'static';
const REPO = 'https://github.com/henrymeihao/photo-study-coach';
// Recording aid: ?slow=N runs the demo N times slower so frame capture stays smooth after speed-up.
const SLOW = Math.min(8, Math.max(1, Number(PARAMS.get('slow')) || 1));
if (SLOW > 1) {
  const slowAll = () => {
    for (const a of document.getAnimations()) if (a.playbackRate !== 1 / SLOW) a.playbackRate = 1 / SLOW;
    requestAnimationFrame(slowAll);
  };
  requestAnimationFrame(slowAll);
}

const state = {
  lang: ['zh', 'en'].find((l) => l === new URLSearchParams(location.search).get('lang')) || localStorage.getItem('coach-lang') || 'zh',
  owner: 'reference',
  image: null,
  sampleId: null,
  aspect: 1.5,
  data: {},
  run: 0,
};
const t = () => STRINGS[state.lang];

function applyLang() {
  document.documentElement.lang = state.lang === 'en' ? 'en' : 'zh-CN';
  document.querySelectorAll('[data-i18n]').forEach((n) => (n.textContent = t()[n.dataset.i18n]));
  document.querySelectorAll('[data-i18n-placeholder]').forEach((n) => (n.placeholder = t()[n.dataset.i18nPlaceholder]));
  document.querySelectorAll('[data-lang]').forEach((b) => b.classList.toggle('on', b.dataset.lang === state.lang));
  $('#progress').innerHTML = t().steps.map((s, i) => `<li data-step="${i}">${s}</li>`).join('');
}

// Downscale on the client: faster upload, fewer image tokens, same normalized coordinates.
async function toDataURL(blob) {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return { url: canvas.toDataURL('image/jpeg', 0.88), aspect: canvas.width / canvas.height };
}

async function start(blob, sampleId = null) {
  if (STATIC && !sampleId) return;
  if (blob.size > 20 * 1024 * 1024) return alert(t().tooBig);
  const { url, aspect } = await toDataURL(blob);
  state.image = url;
  state.aspect = aspect;
  state.sampleId = sampleId;
  analyze();
}

function resetStudio() {
  state.data = {};
  $('#photo').src = state.image;
  $('#stage').style.setProperty('--ar', String(state.aspect));
  $('#overlay').innerHTML = '';
  $('#labels').innerHTML = '';
  $('#stage').classList.add('scanning');
  $('#stage').classList.remove('hide-marks');
  $('#toggleMarks').textContent = t().toggleMarks;
  $('#sections').innerHTML = ORDER.map((k) => `<div class="slot" data-slot="${k}"></div>`).join('');
  markPending();
  document.querySelectorAll('#progress li').forEach((li) => li.classList.remove('done', 'now'));
  $('#progress li[data-step="0"]').classList.add('now');
  $('#landing').hidden = true;
  $('#studio').hidden = false;
  window.scrollTo({ top: 0 });
}

// Show a shimmering placeholder in the next empty slot so the card visibly grows.
function markPending() {
  document.querySelectorAll('.slot.pending').forEach((s) => s.classList.remove('pending'));
  const next = [...document.querySelectorAll('.slot')].find((s) => !s.innerHTML);
  next?.classList.add('pending');
}

function handle(obj) {
  if (obj.t === 'error') return showError(obj.text);
  state.data[obj.t] = obj;
  if (obj.t === 'marks') drawMarks($('#overlay'), $('#labels'), obj.items || [], state.aspect);
  const render = SECTIONS[obj.t];
  const slot = document.querySelector(`[data-slot="${obj.t}"]`);
  if (render && slot) {
    slot.innerHTML = render(obj, t());
    slot.classList.add('in');
  }
  if (obj.t === 'light' && slot) drawSetup(slot.querySelector('[data-setup]'), obj.setup, t());
  const step = STAGE_OF[obj.t];
  if (step !== undefined) {
    document.querySelectorAll('#progress li').forEach((li) => {
      const i = Number(li.dataset.step);
      li.classList.toggle('done', i <= step);
      li.classList.toggle('now', i === step + 1);
    });
  }
  if (obj.t === 'seen') $('#stage').classList.remove('scanning');
  markPending();
}

function showError(text) {
  $('#stage').classList.remove('scanning');
  document.querySelectorAll('.slot.pending').forEach((s) => s.classList.remove('pending'));
  $('#sections').insertAdjacentHTML('afterbegin', `<section class="sec error"><h3>${t().error}</h3><p>${esc(text)}</p></section>`);
}

// Replays a saved analysis with the same pacing as the server's cached replay.
async function* replay(url) {
  const lines = await fetch(url).then((r) => r.json());
  for (const obj of lines) {
    await new Promise((r) => setTimeout(r, (obj.t === 'seen' ? 900 : 650) * SLOW));
    yield obj;
  }
}

async function* live() {
  const res = await fetch(`/api/analyze?slow=${SLOW}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: state.image, lang: state.lang, owner: state.owner, intent: $('#intent').value.trim() }),
  });
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const l of lines) if (l.trim()) yield JSON.parse(l);
  }
}

async function analyze() {
  const run = ++state.run;
  resetStudio();
  try {
    const source = STATIC ? replay(`data/${state.sampleId}-${state.lang}.json`) : live();
    for await (const obj of source) {
      if (run !== state.run) return;
      handle(obj);
    }
  } catch (err) {
    if (run === state.run) showError(err.message);
  } finally {
    if (run === state.run) {
      $('#stage').classList.remove('scanning');
      document.querySelectorAll('.slot.pending').forEach((s) => s.classList.remove('pending'));
      if (state.data.steps) document.querySelectorAll('#progress li').forEach((li) => li.classList.add('done'));
    }
  }
}

function highlight(i, on) {
  document.querySelectorAll(`[data-mark="${i}"]`).forEach((n) => n.classList.toggle('hl', on));
  $('#stage').classList.toggle('focus', on);
}

async function loadSamples() {
  const list = await fetch('samples/credits.json').then((r) => r.json());
  $('#sampleList').innerHTML = list.map((s) => `<button type="button" class="sample" data-id="${esc(s.id)}" data-src="${esc(s.file)}"><img src="${esc(s.file)}" alt="" loading="lazy" /><span>© ${esc(s.author)} · Unsplash</span></button>`).join('');
}

// Static build: the upload box becomes two ways to run the coach on your own photo.
async function setupStatic() {
  document.body.classList.add('static');
  document.querySelector('.eyebrow').dataset.i18n = 'eyebrowStatic';
  document.querySelector('.samples p').dataset.i18n = 'samplesStatic';
  applyLang();
  $('#drop').hidden = true;
  document.querySelector('.options').hidden = true;
  $('#cta').hidden = false;
  $('#ctaSkill').href = REPO + '#安装';
  const prompt = await fetch('chat-prompt.txt').then((r) => r.text());
  $('#ctaCopy').addEventListener('click', async () => {
    await navigator.clipboard.writeText(prompt);
    $('#ctaCopy').textContent = t().copied;
    setTimeout(() => ($('#ctaCopy').textContent = t().ctaCopy), 2000);
  });
}

function bind() {
  $('#file').addEventListener('change', (e) => e.target.files[0] && start(e.target.files[0]));
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) start(f); });
  window.addEventListener('paste', (e) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith('image/')); if (f) start(f); });

  $('#sampleList').addEventListener('click', async (e) => {
    const btn = e.target.closest('.sample');
    if (btn) start(await fetch(btn.dataset.src).then((r) => r.blob()), btn.dataset.id);
  });
  document.querySelectorAll('[data-owner]').forEach((b) => b.addEventListener('click', () => {
    state.owner = b.dataset.owner;
    document.querySelectorAll('[data-owner]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.lang === state.lang) return;
    state.lang = b.dataset.lang;
    localStorage.setItem('coach-lang', state.lang);
    applyLang();
    if (!$('#studio').hidden && state.image) analyze();
  }));
  $('#home').addEventListener('click', () => {
    state.run++;
    $('#studio').hidden = true;
    $('#landing').hidden = false;
    $('#file').value = '';
  });
  $('#toggleMarks').addEventListener('click', () => {
    const hidden = $('#stage').classList.toggle('hide-marks');
    $('#toggleMarks').textContent = hidden ? t().showMarks : t().toggleMarks;
  });
  const hover = (e, on) => { const n = e.target.closest('[data-mark]'); if (n) highlight(n.dataset.mark, on); };
  for (const root of [$('#sections'), $('#labels')]) {
    root.addEventListener('mouseover', (e) => hover(e, true));
    root.addEventListener('mouseout', (e) => hover(e, false));
  }
}

applyLang();
bind();
await loadSamples();
if (STATIC) await setupStatic();

// Autopilot for recording: ?demo=<sample index> plays upload, analysis and a guided scroll with no input.
const demoParam = PARAMS.get('demo');
if (demoParam !== null) runDemo(Number(demoParam) || 0);

async function runDemo(index) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms * SLOW));
  const until = async (check) => { while (!check()) await sleep(150); };
  // Scroll so the element sits just below everything pinned at the top (header, and the photo on phones).
  const pinned = () => $('.top').offsetHeight + (matchMedia('(max-width: 900px)').matches ? $('.stage-col').offsetHeight : 0) + 14;
  const scrollTo = (el, offset = pinned()) => new Promise((resolve) => {
    const from = scrollY;
    const to = Math.min(document.documentElement.scrollHeight - innerHeight, Math.max(0, (el ? el.getBoundingClientRect().top + scrollY - offset : 0)));
    const duration = 900 * SLOW;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / duration);
      window.scrollTo(0, from + (to - from) * (1 - Math.pow(1 - k, 3)));
      k < 1 ? requestAnimationFrame(step) : resolve();
    };
    requestAnimationFrame(step);
  });
  document.body.classList.add('demo');
  await sleep(2200);
  const btn = document.querySelectorAll('.sample')[index];
  btn.classList.add('picked');
  await sleep(700);
  start(await fetch(btn.dataset.src).then((r) => r.blob()), btn.dataset.id);
  await until(() => state.data.evidence);
  await sleep(1600);
  const items = document.querySelectorAll('.evidence li');
  for (const li of items) {
    await scrollTo(li, matchMedia('(max-width: 900px)').matches ? pinned() : innerHeight / 2);
    highlight(li.dataset.mark, true);
    li.classList.add('hl');
    await sleep(1500);
    highlight(li.dataset.mark, false);
  }
  await until(() => state.data.deep);
  for (const key of ['light', 'composition', 'steps', 'counter', 'practice', 'scenes']) {
    await scrollTo(document.querySelector(`[data-slot="${key}"]`));
    await sleep(key === 'steps' || key === 'light' ? 3200 : 2400);
  }
  await scrollTo(null);
  await sleep(1200);
  document.body.classList.add('demo-done');
}
