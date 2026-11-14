/* The page is a film. Scroll position is the playhead: every scene, wipe, word and
   number is a pure function of it, so scrubbing, scrolling and autoplay all look the same. */
(function () {
  const html = document.documentElement;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b === undefined ? 1 : b, Math.max(a === undefined ? 0 : a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const out3 = (t) => 1 - Math.pow(1 - t, 3);
  const io = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const COL = { ink: [.078, .075, .067], bone: [.929, .906, .855], bottle: [.059, .239, .18], persimmon: [.949, .329, .176], butter: [.953, .784, .275] };
  const UI = { 'on-ink': '#EDE7DA', 'on-bone': '#141311', 'on-persimmon': '#141311', 'on-bottle': '#EDE7DA', 'on-butter': '#141311' };
  const BG = { 'on-ink': '#141311', 'on-bone': '#EDE7DA', 'on-persimmon': '#F2542D', 'on-bottle': '#0F3D2E', 'on-butter': '#F3C846' };
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = coarse || innerWidth < 820;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const V = 0.95;  // autoplay cruising speed, in screens per second
  const SQ = 0.6;  // a scene's words are complete by this fraction of it
  const PRE = 0.22, POST = 0.3; // a scene's wipe starts PRE before its slot and ends POST into it

  /* ---------- split text into words or characters ---------- */
  function split(root, mode) {
    let i = 0;
    (function walk(node) {
      Array.from(node.childNodes).forEach((ch) => {
        if (ch.nodeType === 1) return walk(ch);
        if (ch.nodeType !== 3) return;
        const frag = document.createDocumentFragment();
        const parts = mode === 'c' ? Array.from(ch.textContent) : ch.textContent.split(/(\s+)/);
        parts.forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) return frag.appendChild(document.createTextNode(' '));
          if (mode === 'c') { const c = document.createElement('span'); c.className = 'c'; c.style.setProperty('--i', i++); c.textContent = part; frag.appendChild(c); }
          else { const w = document.createElement('span'); w.className = 'w'; const inner = document.createElement('i'); inner.style.setProperty('--i', i++); inner.textContent = part; w.appendChild(inner); frag.appendChild(w); }
        });
        node.replaceChild(frag, ch);
      });
    })(root);
    root.style.setProperty('--n', i);
  }
  $$('[data-split]').forEach((el) => { if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', el.textContent.trim().replace(/\s+/g, ' ')); split(el, el.dataset.split); });

  /* ---------- rolling-digit counters ---------- */
  function odometer(el) {
    const [from, to] = el.dataset.odo.split(',').map(Number), digits = String(Math.max(from, to)).length, sep = el.hasAttribute('data-sep'), step = el.hasAttribute('data-step');
    el.classList.add('odo'); const cols = [];
    for (let k = digits - 1; k >= 0; k--) {
      const col = document.createElement('span'); col.className = 'col'; col.setAttribute('aria-hidden', 'true');
      for (let d = 0; d <= 10; d++) { const s = document.createElement('span'); s.textContent = d % 10; col.appendChild(s); }
      el.appendChild(col); cols[k] = col;
      if (sep && k === 3) { const c = document.createElement('span'); c.textContent = ','; c.setAttribute('aria-hidden', 'true'); el.appendChild(c); }
    }
    return (t) => {
      let v = from + (to - from) * t;
      if (step) { const b = Math.floor(v + 1e-9); v = b + io(clamp((v - b - .7) / .3)); } // rest on each whole number, roll in the last 30%
      for (let k = 0; k < digits; k++) {
        const unit = Math.pow(10, k), f = v / unit, base = Math.floor(f + 1e-9), frac = f - base;
        const roll = k === 0 ? frac : clamp((frac - (1 - 1 / unit)) * unit, 0, 1);
        cols[k].style.setProperty('--d', ((base % 10) + (to - from > 500 && k < 2 && t < 1 ? frac : roll)).toFixed(3));
      }
    };
  }

  /* ---------- lines that roll like a slot reel as the year rolls ---------- */
  function roles(el) {
    const list = el.dataset.roles.split('|').map((s) => { const i = s.indexOf(':'); return [+s.slice(0, i), s.slice(i + 1)]; });
    const first = list[0][0], span = list[list.length - 1][0] - first, chips = el.hasAttribute('data-chips');
    const fill = (node, txt) => {
      node.textContent = '';
      if (!chips) { txt.split(' ').forEach((w, i) => { if (!w) return; if (i) node.appendChild(document.createTextNode(' ')); const n = document.createElement('span'); n.className = 'nw'; n.textContent = w; node.appendChild(n); }); return; } // words never break at a hyphen
      if (txt) txt.split(' + ').forEach((w) => { const b = document.createElement('b'); b.textContent = w; node.appendChild(b); });
    };
    el.textContent = ''; el.classList.add('slot');
    const A = document.createElement('span'), B = document.createElement('span');
    [A, B].forEach((n) => { n.setAttribute('aria-hidden', 'true'); el.appendChild(n); });
    let shown = -1, aTxt = null;
    return (t) => {
      // the line starts rolling as the year digit starts to roll (the last 30% of a year) and lands just after it
      const year = first + span * t / .86; let k = 0;
      for (let i = 0; i < list.length; i++) if (year >= list[i][0] - .3) k = i;
      const e = k === 0 ? 1 : io(clamp((year - (list[k][0] - .3)) / .42));
      if (k !== shown) { fill(B, list[k][1]); shown = k; }
      const want = e < 1 && k > 0 ? list[k - 1][1] : '';
      if (want !== aTxt) { fill(A, want); aTxt = want; }
      A.style.transform = `translateY(${(-e * 112).toFixed(1)}%)`; A.style.opacity = clamp(1 - e * 1.5).toFixed(3);
      B.style.transform = `translateY(${((1 - e) * 112).toFixed(1)}%)`; B.style.opacity = clamp(e * 1.5).toFixed(3);
    };
  }

  /* ---------- scenes ---------- */
  let acc = 0;
  const scenes = $$('.scene').map((el, i) => {
    const cls = Array.from(el.classList).find((c) => UI[c]);
    const s = {
      el, i, dur: +el.dataset.dur, start: acc, wipe: el.dataset.wipe, origin: el.dataset.origin, shape: el.dataset.shape, title: el.dataset.title,
      col: COL[el.dataset.ink], acc: COL[el.dataset.accent], place: el.dataset.place, spin: +(el.dataset.spin || 0),
      ui: UI[cls], bg: BG[cls], live: false, clip: '', center: null, block: $('.copy, .title-card', el), top: 0,
      kind: i === 0 ? 'title' : el.dataset.beats ? 'beats' : $('.reel', el) ? 'reel' : 'text',
      beats: (el.dataset.beats || '').split(',').filter(Boolean).map(Number),
      stops: (el.dataset.stops || '').split('|').filter(Boolean).map((x) => { const k = x.split(':'); return [+k[0], k[1]]; }),
      items: $$('[data-a]', el).map((n) => {
        const [a, b] = n.dataset.a.split(',').map(Number);
        const it = { el: n, a, b, lin: n.hasAttribute('data-lin'), last: -1, run: null, mark: n.classList.contains('mark') };
        if (n.dataset.odo) it.run = odometer(n); else if (n.dataset.roles) it.run = roles(n);
        return it;
      }),
    };
    acc += s.dur; s.end = acc; return s;
  });
  const lastScene = scenes[scenes.length - 1];
  const maxProg = acc - 0.55;
  // every moment the cloud changes shape: scene starts, plus stops inside a scene
  const keys = [];
  scenes.forEach((s) => { keys.push({ at: s.start, shape: s.shape, s, w: [.34, .3] }); s.stops.forEach((st) => keys.push({ at: s.start + st[0] * s.dur, shape: st[1], s, w: [.15, .15] })); });

  /* ---------- beats: where the film holds still long enough to read ---------- */
  // squeeze each scene's reveals into its first 60%, so the words are complete well before the next wipe
  scenes.forEach((s) => {
    if (s.kind !== 'text') return;
    const mb = Math.max.apply(null, s.items.map((it) => it.b)), f = Math.min(1, SQ / mb);
    s.items.forEach((it) => { it.a *= f; it.b *= f; });
    s.restF = mb * f + .04;
  });
  const rests = [], zones = []; // rests: where autoplay pauses; zones: spans where a frame is complete, so a stop there needs no snap
  scenes.forEach((s) => {
    const at = (f) => s.start + f * s.dur;
    if (s.kind === 'title') { rests.push({ p: 0, dwell: 0, inR: .5, outR: .04, s }); zones.push({ a: 0, b: .02, to: 0, back: 0 }); } // the title leaves as soon as you scroll
    else if (s.kind === 'beats') s.beats.forEach((f, j) => {
      const fin = j === s.beats.length - 1, p = at(f);
      rests.push({ p, dwell: fin ? 2.1 : 1.15, inR: fin ? .6 : .3, outR: .22, s });
      zones.push({ a: p - .02 * s.dur, b: Math.min(p + .02 * s.dur, s.end - .32), to: p, back: p });
    });
    else if (s.kind === 'reel') { rests.push({ p: at(.5), dwell: 0, pass: true, s }); zones.push({ a: s.start + POST, b: s.end - PRE, to: s.start + POST, back: s.end - PRE }); }
    else if (s === lastScene) { rests.push({ p: maxProg, dwell: 0, inR: .7, outR: .3, s }); zones.push({ a: at(s.restF), b: maxProg, to: maxProg, back: maxProg }); }
    else { const p = at(s.restF); rests.push({ p, dwell: 1.5, inR: .62, outR: .42, s }); zones.push({ a: p - .03, b: Math.min(p + .1, s.end - .3), to: p, back: p }); }
  });

  // autoplay speed: cruise between beats, ease into and out of each one
  const real = rests.filter((r) => !r.pass);
  function speed(p) {
    let a = real[0], b = null;
    for (const r of real) { if (r.p <= p) a = r; else if (!b) b = r; }
    const ramp = (d, R) => (d >= R ? 1 : Math.max(.08, Math.pow(d / R, .6)));
    return V * Math.min(ramp(p - a.p, a.outR), b ? ramp(b.p - p, b.inR) : 1);
  }
  // a time table: prog against film time, with each dwell as a flat step
  const TP = [], TT = [];
  (function () {
    let t = 0; const H = .01;
    rests.forEach((r, j) => {
      TP.push(r.p); TT.push(t); r.t0 = t;
      if (r.dwell) { t += r.dwell; TP.push(r.p); TT.push(t); }
      r.t1 = t;
      const nx = rests[j + 1]; if (!nx) return;
      const n = Math.max(2, Math.ceil((nx.p - r.p) / H));
      for (let k = 1; k <= n; k++) {
        const p0 = r.p + (nx.p - r.p) * (k - 1) / n, p1 = r.p + (nx.p - r.p) * k / n;
        t += (p1 - p0) / speed((p0 + p1) / 2);
        if (k < n) { TP.push(p1); TT.push(t); }
      }
    });
  })();
  const TOTAL = TT[TT.length - 1];
  function timeAt(p, after) {
    p = clamp(p, 0, maxProg);
    let lo = 0, hi = TP.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (TP[m] <= p) lo = m; else hi = m - 1; }
    if (!after && TP[lo] === p) while (lo > 0 && TP[lo - 1] === TP[lo]) lo--;
    if (after && lo < TP.length - 1 && TP[lo + 1] === TP[lo]) lo++;
    if (lo >= TP.length - 1 || TP[lo] === p) return TT[lo];
    return lerp(TT[lo], TT[lo + 1], (p - TP[lo]) / (TP[lo + 1] - TP[lo]));
  }
  function progAt(t) {
    let lo = 0, hi = TT.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (TT[m] <= t) lo = m; else hi = m - 1; }
    if (lo >= TT.length - 1) return TP[TP.length - 1];
    return lerp(TP[lo], TP[lo + 1], (t - TT[lo]) / (TT[lo + 1] - TT[lo]));
  }
  const fmt = (t) => { const x = Math.round(t); return `${x / 60 | 0}:${String(x % 60).padStart(2, '0')}`; };
  const chapters = scenes.map((s, i) => ({ s, i, title: s.title, p0: i ? s.start : 0, to: rests.find((r) => r.s === s).p }));
  chapters.forEach((c, i) => { c.p1 = i < chapters.length - 1 ? chapters[i + 1].p0 : maxProg; c.t0 = timeAt(c.p0); c.t1 = timeAt(c.p1); });

  /* ---------- wipes: how each scene cuts in over the one before it ---------- */
  function wipe(s, w, W, H) {
    const R = Math.hypot(W, H);
    switch (s.wipe) {
      case 'dot': {
        if (!s.center) { const r = $(s.origin).getBoundingClientRect(); s.center = r.width ? [r.left + r.width / 2, r.top + r.height / 2] : [W / 2, H / 2]; }
        return `circle(${(w * w * R * 1.05).toFixed(1)}px at ${s.center[0].toFixed(1)}px ${s.center[1].toFixed(1)}px)`;
      }
      case 'circle': return `circle(${(w * R * .56).toFixed(1)}px at 50% 50%)`;
      case 'iris': return `circle(${(w * R * 1.05).toFixed(1)}px at 100% 100%)`;
      case 'slash': { const x = w * 150; return `polygon(0 0, ${x}% 0, ${x - 50}% 100%, 0 100%)`; }
      case 'split': return `inset(0 ${(50 * (1 - w)).toFixed(2)}%)`;
      case 'up': { const y = 100 - w * 135; return `polygon(0 ${y + 35}%, 100% ${y}%, 100% 100%, 0 100%)`; }
      case 'diamond': { const r = w * 105; return `polygon(50% ${50 - r}%, ${50 + r}% 50%, 50% ${50 + r}%, ${50 - r}% 50%)`; }
      case 'blinds': case 'shutter': {
        const n = 6, pts = [], vert = s.wipe === 'blinds';
        for (let k = 0; k < n; k++) {
          const h = (clamp(w * 1.7 - k * .14) * 100).toFixed(1), a = (k * 100 / n).toFixed(2), b = ((k + 1) * 100 / n).toFixed(2);
          if (vert) pts.push(`${a}% 0`, `${a}% ${h}%`, `${b}% ${h}%`, `${b}% 0`);
          else pts.push(`0 ${a}%`, `${h}% ${a}%`, `${h}% ${b}%`, `0 ${b}%`);
        }
        return `polygon(${pts.join(',')})`;
      }
    }
    return 'none';
  }

  /* ---------- where the cloud sits in each kind of scene ---------- */
  let nameHalf = 3.5, bandTop = 62;
  function place(s, aspect, W, H) {
    const wide = aspect > 1, kind = s.place;
    if (!wide && kind !== 'center' && s.top > 0) {
      // portrait: fit the shape into the free band between the top bar and the words, so they never overlap
      const h = Math.max(40, s.top - bandTop - 14);
      const base = kind === 'name' ? .9 / nameHalf : kind === 'top' ? .52 : .6;
      const scale = Math.max(base * .4, Math.min(base, h / W * .94));
      return { off: [0, 1 - 2 * (bandTop + h / 2) / H], scale };
    }
    if (kind === 'name') return { off: [0, wide ? .16 : .24], scale: (wide ? .86 * aspect : .9) / nameHalf, spin: 0 };
    if (kind === 'top') return wide ? { off: [0, .42], scale: .4 } : { off: [0, .46], scale: .52 };
    if (kind === 'center') return { off: [0, 0], scale: wide ? .78 : .8 };
    return wide ? { off: [.5, 0], scale: .52 } : { off: [0, .4], scale: .6 };
  }

  /* ---------- set up ---------- */
  const stage = $('#stage'), track = $('#track'), canvas = $('#cloud'), pp = $('#pp'), timeEl = $('#time'), chapEl = $('#chap');
  const bar = $('#bar'), dock = $('#dock'), toastEl = $('#toast'), menu = $('#menu'), menuBtn = $('#menu-btn'), big = $('#big-play');
  const ppFill = $('.pp-fill'), ring = $('.badge-ring'), header = $('.chrome-top'), cursor = $('#cursor');
  const N = small ? 16000 : 42000;
  const cloud = AV.createCloud(canvas, N);
  let unit = innerHeight, vw = innerWidth, wideName = innerWidth / innerHeight > 1.15;

  function layout() {
    unit = innerHeight; vw = innerWidth;
    track.style.height = Math.round(maxProg * unit + innerHeight + 2) + 'px';
    scenes.forEach((s) => { s.center = null; s.clip = ''; });
    bandTop = header.getBoundingClientRect().bottom + 8;
    if (cloud) cloud.resize(small ? 1.75 : 2);
  }
  function buildShapes() {
    if (!cloud) return;
    wideName = innerWidth / innerHeight > 1.15;
    nameHalf = wideName ? 1500 / 420 : 760 / 520;
    cloud.build(['AADITYA', 'VERMA'], wideName);
  }

  /* ---------- chapter timeline (top) and chapters menu ---------- */
  chapters.forEach((c) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'seg';
    b.style.flexGrow = (c.t1 - c.t0).toFixed(2);
    b.setAttribute('aria-label', `${c.title}, chapter ${c.i + 1} of ${chapters.length}, at ${fmt(c.t0)}`);
    b.innerHTML = '<i></i><span class="tip"></span>'; b.lastChild.textContent = c.title;
    b.addEventListener('click', (e) => { if (e.detail === 0) jump(c); }); // keyboard; pointer clicks are handled by the scrubber
    bar.appendChild(b); c.seg = b; c.f = -1;
    const li = document.createElement('li'), m = document.createElement('button');
    m.type = 'button'; m.className = 'mi'; m.style.setProperty('--i', c.i);
    m.innerHTML = '<span class="mi-n"></span><span class="mi-t"></span><span class="mi-tm"></span>';
    m.children[0].textContent = String(c.i + 1).padStart(2, '0'); m.children[1].textContent = c.title; m.children[2].textContent = fmt(c.t0);
    m.addEventListener('click', () => { closeMenu(true); jump(c); });
    li.appendChild(m); $('#menu-list').appendChild(li); c.mi = m;
  });

  /* ---------- state ---------- */
  let prog = 0, mode = 'idle', playT = 0, glide = null, lastSet = -1, time = 0, last = 0, uiCol = '', uiBg = '', kick = 0, chapI = -1, toldTakeover = false;
  let lastUser = 0, dir = 1, lastY = 0, touching = false, dragging = false, menuOpen = false, ringA = 0, hoverBig = false;
  const ptr = { x: 9, y: 9, sx: 0, sy: 0, on: false };
  const cur = { x: -99, y: -99, tx: -99, ty: -99, s: 1, hot: false, on: false };

  function drive(p) {
    prog = clamp(p, 0, maxProg);
    const y = Math.round(prog * unit);
    if (Math.abs(scrollY - y) >= 1) scrollTo(0, y);
    lastSet = y;
  }
  function glideTo(p, o) {
    o = o || {}; p = clamp(p, 0, maxProg);
    const d = Math.abs(p - prog);
    const T = calm ? .2 : (o.T || clamp(.42 + d * .14, .45, 1.6));
    glide = { from: prog, to: p, t: 0, T, then: o.then || null, resume: !!o.resume };
    mode = 'glide'; lastSet = -1;
  }
  function stopGlide() { glide = null; if (mode === 'glide') mode = 'idle'; }

  /* ---------- feedback ---------- */
  let toastT = 0;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 2400);
  }
  function bump(el) { if (!calm && el.animate) el.animate([{ transform: 'scale(.84)' }, { transform: 'scale(1.08)', offset: .55 }, { transform: 'scale(1)' }], { duration: 460, easing: 'cubic-bezier(.2,.8,.2,1)' }); }
  function shock(el) {
    if (calm || !el.animate) return;
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const far = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) * 2 / 120;
    [0, 140, 280].forEach((delay, k) => {
      const d = document.createElement('i'); d.className = 'shock'; d.style.left = x + 'px'; d.style.top = y + 'px';
      if (k === 1) d.style.borderColor = 'var(--bone)';
      stage.insertBefore(d, header);
      d.animate([{ transform: 'scale(.5)', opacity: .95 }, { transform: `scale(${far.toFixed(2)})`, opacity: 0 }], { duration: 1100, delay, easing: 'cubic-bezier(.15,.7,.2,1)', fill: 'backwards' }).onfinish = () => d.remove();
    });
  }
  const buzz = () => { try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {} };

  /* ---------- play / pause / seek ---------- */
  function setUI() {
    const on = mode === 'play' || !!(glide && glide.resume);
    html.classList.toggle('playing', on);
    pp.setAttribute('aria-label', on ? 'Pause' : html.classList.contains('ended') ? 'Watch again' : 'Play the film');
  }
  function begin(skipDwell) {
    const r = rests.find((x) => Math.abs(x.p - prog) < .015);
    playT = r ? (skipDwell === false ? r.t0 : r.t1) : timeAt(prog, true);
    if (playT >= TOTAL - .05) playT = 0;
    mode = 'play'; glide = null; lastSet = -1; setUI();
  }
  function play(msg) {
    if (menuOpen) closeMenu();
    kick = calm ? 0 : 1; buzz();
    if (prog >= maxProg - .02) { toast('Rewinding'); glideTo(0, { T: 1.4, then: begin, resume: true }); setUI(); return; }
    begin(true);
    toast(msg || (toldTakeover ? 'Playing' : 'Playing. Scroll anytime to take over.')); toldTakeover = true;
  }
  function pause(msg) {
    if (mode === 'play' || (glide && glide.resume)) { mode = 'idle'; glide = null; setUI(); if (msg) toast(msg); }
  }
  function toggle(fromBig) {
    if (mode === 'play' || (glide && glide.resume)) { pause('Paused'); bump(pp); return; }
    if (fromBig) shock(big); else bump(pp);
    play();
  }
  function takeover() {
    if (mode === 'play' || (glide && glide.resume)) pause('Paused. Scroll at your own pace.');
    else if (mode === 'glide') { glide = null; mode = 'idle'; setUI(); }
  }
  function jump(c) {
    const resume = mode === 'play';
    kick = calm ? 0 : .45;
    glideTo(c.to, { then: resume ? () => begin(false) : null, resume });
  }
  function step(d) {
    const from = glide ? glide.to : prog, list = rests.map((r) => r.p);
    const target = d > 0 ? list.find((x) => x > from + .01) : list.slice().reverse().find((x) => x < from - .01);
    if (target === undefined) return;
    const resume = mode === 'play' || !!(glide && glide.resume);
    kick = calm ? 0 : .25;
    glideTo(target, { then: resume ? () => begin(false) : null, resume });
  }
  function snap() {
    const p = clamp(scrollY / unit, 0, maxProg);
    if (zones.some((z) => p >= z.a - .006 && p <= z.b + .006)) return;
    let z = dir > 0 ? zones.find((x) => x.a > p) : zones.slice().reverse().find((x) => x.b < p);
    if (!z) z = dir > 0 ? zones[zones.length - 1] : zones[0];
    const to = dir > 0 ? z.to : z.back;
    glideTo(to, { T: clamp(.38 + Math.abs(to - p) * .2, .42, 1.05) });
  }

  pp.addEventListener('click', () => toggle(false));
  big.addEventListener('click', () => toggle(true));
  $('#prev').addEventListener('click', () => step(-1));
  $('#next').addEventListener('click', () => step(1));
  $('#home').addEventListener('click', (e) => { e.preventDefault(); if (menuOpen) closeMenu(); pause(); kick = calm ? 0 : .45; glideTo(0); });

  // the timeline: tap a chapter to jump, drag along it to scrub
  function hitSeg(x) {
    for (const c of chapters) { const r = c.seg.getBoundingClientRect(); if (x <= r.right + 2 || c === chapters[chapters.length - 1]) return { c, f: clamp((x - r.left) / r.width) }; }
  }
  let dragX0 = 0, dragMoved = false, dragLastX = 0;
  bar.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    dragging = true; dragMoved = false; dragX0 = dragLastX = e.clientX;
    try { bar.setPointerCapture(e.pointerId); } catch (err) {}
  });
  bar.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    if (!dragMoved && Math.abs(e.clientX - dragX0) > 6) { dragMoved = true; pause(); stopGlide(); html.classList.add('scrubbing'); }
    if (!dragMoved) return;
    const h = hitSeg(e.clientX), p = progAt(h.c.t0 + h.f * (h.c.t1 - h.c.t0));
    if (Math.abs(e.clientX - dragLastX) > 1) dir = e.clientX > dragLastX ? 1 : -1;
    dragLastX = e.clientX;
    drive(p); lastSet = -1;
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false; html.classList.remove('scrubbing');
    if (!dragMoved && e.type === 'pointerup') jump(hitSeg(e.clientX).c);
    else lastUser = performance.now();
  };
  bar.addEventListener('pointerup', endDrag); bar.addEventListener('pointercancel', endDrag);

  // chapters menu
  function openMenu() {
    if (menuOpen) return;
    pause(); stopGlide(); menuOpen = true;
    const r = menuBtn.getBoundingClientRect(), ox = r.left + r.width / 2, oy = r.top + r.height / 2;
    menu.style.setProperty('--ox', ox + 'px'); menu.style.setProperty('--oy', oy + 'px');
    menu.style.setProperty('--or', Math.hypot(Math.max(ox, innerWidth - ox), Math.max(oy, innerHeight - oy)) + 20 + 'px');
    chapters.forEach((c) => c.mi.classList.toggle('now', c.i === chapI));
    menu.hidden = false; dock.inert = true;
    requestAnimationFrame(() => requestAnimationFrame(() => html.classList.add('menu-open')));
    menuBtn.setAttribute('aria-expanded', 'true'); $('.mb-label', menuBtn).textContent = 'Close';
    setTimeout(() => (chapters[Math.max(0, chapI)].mi).focus({ preventScroll: true }), 260);
  }
  function closeMenu(keepFocus) {
    if (!menuOpen) return;
    menuOpen = false; html.classList.remove('menu-open'); dock.inert = false;
    menuBtn.setAttribute('aria-expanded', 'false'); $('.mb-label', menuBtn).textContent = 'Chapters';
    setTimeout(() => { if (!menuOpen) menu.hidden = true; }, 760);
    if (!keepFocus) menuBtn.focus({ preventScroll: true });
  }
  menuBtn.addEventListener('click', () => (menuOpen ? closeMenu() : openMenu()));

  // tapping the picture while it plays pauses it, like a video
  stage.addEventListener('click', (e) => {
    if (mode === 'play' && !e.target.closest('a, button, .dock, .bar, .menu, .chrome-top')) { pause('Paused'); bump(pp); }
  });

  addEventListener('keydown', (e) => {
    if (menuOpen) { if (e.key === 'Escape') { e.preventDefault(); closeMenu(); } return; }
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'Space' || e.key === 'k') { if (/^(A|BUTTON)$/.test(tag)) return; e.preventDefault(); toggle(false); }
    else if (/^(ArrowRight|ArrowDown|PageDown)$/.test(e.key)) { e.preventDefault(); step(1); }
    else if (/^(ArrowLeft|ArrowUp|PageUp)$/.test(e.key)) { e.preventDefault(); step(-1); }
    else if (e.key === 'Home') { e.preventDefault(); pause(); glideTo(0); }
    else if (e.key === 'End') { e.preventDefault(); pause(); glideTo(maxProg); }
  });

  /* ---------- the viewer taking over ---------- */
  addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) + Math.abs(e.deltaX) > 1 && !menuOpen) takeover(); }, { passive: true });
  let touch0 = null;
  addEventListener('touchstart', (e) => {
    const t = e.touches[0]; touching = true;
    touch0 = { x: t.clientX, y: t.clientY, ui: !!e.target.closest('a, button, .dock, .bar, .menu'), moved: false };
    point(t.clientX, t.clientY);
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    const t = e.touches[0]; point(t.clientX, t.clientY);
    if (touch0 && !touch0.moved && Math.hypot(t.clientX - touch0.x, t.clientY - touch0.y) > 10) { touch0.moved = true; if (!touch0.ui) takeover(); }
  }, { passive: true });
  addEventListener('touchend', (e) => { if (!e.touches.length) { touching = false; ptr.on = false; if (touch0 && touch0.moved) lastUser = performance.now(); } }, { passive: true });
  addEventListener('scroll', () => {
    const y = scrollY;
    if (lastSet >= 0 && Math.abs(y - lastSet) < 3) return; // our own scroll
    if (mode !== 'idle' && lastSet >= 0 && Math.abs(y - lastSet) > 40) takeover(); // a scrollbar drag
    if (Math.abs(y - lastY) > .5) dir = y > lastY ? 1 : -1;
    lastY = y; lastSet = -1;
    if (mode === 'idle') lastUser = performance.now();
  }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  /* ---------- pointer: pushes the particles, pulls the play badge, drives the cursor ring ---------- */
  function point(x, y) { ptr.x = x / innerWidth * 2 - 1; ptr.y = 1 - y / innerHeight * 2; ptr.on = true; }
  const fine = matchMedia('(pointer: fine)').matches && !calm;
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    point(e.clientX, e.clientY);
    if (fine) { cur.tx = e.clientX; cur.ty = e.clientY; cur.hot = !!e.target.closest('a, button, .bar'); if (!cur.on) { cur.on = true; cur.x = cur.tx; cur.y = cur.ty; cursor.classList.add('on'); } }
    if (scenes[0].live && !calm) {
      const r = big.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), d = Math.hypot(dx, dy);
      const pull = d < r.width * 1.1 ? .24 : 0;
      big.style.setProperty('--mx', (dx * pull).toFixed(1) + 'px'); big.style.setProperty('--my', (dy * pull).toFixed(1) + 'px');
      hoverBig = d < r.width / 2;
    }
  }, { passive: true });
  document.addEventListener('pointerleave', () => { ptr.on = false; cur.on = false; cursor.classList.remove('on'); big.style.setProperty('--mx', '0px'); big.style.setProperty('--my', '0px'); hoverBig = false; });

  /* ---------- the frame loop ---------- */
  function update(now) {
    requestAnimationFrame(update);
    const dt = Math.min(.05, (now - last) / 1000 || .016); last = now; time += dt;

    if (mode === 'play') {
      playT = Math.min(TOTAL, playT + dt); drive(progAt(playT));
      if (playT >= TOTAL) { mode = 'idle'; html.classList.add('ended'); setUI(); toast("That's the film. Press play to watch again."); }
    } else if (mode === 'glide') {
      glide.t += dt; const u = clamp(glide.t / glide.T);
      drive(lerp(glide.from, glide.to, io(u)));
      if (u >= 1) { const then = glide.then; glide = null; mode = 'idle'; if (then) then(); setUI(); }
    } else {
      const target = clamp(scrollY / unit, 0, maxProg);
      prog += (target - prog) * (1 - Math.exp(-dt * 10));
      if (Math.abs(target - prog) < .0004) prog = target;
      if (lastUser && !touching && !dragging && !menuOpen && !window.__noSnap && now - lastUser > 170) { lastUser = 0; snap(); }
    }
    html.classList.toggle('ended', mode !== 'play' && !(glide && glide.resume) && prog >= maxProg - .02);
    kick *= Math.exp(-dt * 3.2); if (kick < .002) kick = 0;

    const W = vw, H = innerHeight;
    let front = scenes[0];
    for (const s of scenes) {
      const live = prog >= s.start - PRE && (s === lastScene || prog < s.end + POST);
      if (live !== s.live) { s.live = live; s.el.classList.toggle('live', live); }
      if (!live) continue;
      const p = (prog - s.start) / s.dur;
      s.el.style.setProperty('--p', clamp(p).toFixed(4));
      s.el.style.setProperty('--x', s === lastScene ? 0 : (s.i === 0 ? clamp(prog / (s.end - .2)) : clamp((prog - (s.end - .34)) / .5)).toFixed(4));
      if (s.i > 0) {
        const w = clamp((prog - (s.start - PRE)) / (PRE + POST));
        const clip = w >= 1 ? 'none' : wipe(s, io(w), W, H);
        if (clip !== s.clip) { s.clip = clip; s.el.style.clipPath = clip; s.el.style.webkitClipPath = clip; }
        if (w > .5) front = s;
      }
      if (s.block && W / H <= 1) { // where the words start, smoothed so the shape glides instead of jumping
        const top = s.block.getBoundingClientRect().top + (s === lastScene ? 0 : parseFloat(s.el.style.getPropertyValue('--x') || 0) * H * .09);
        s.top = s.top ? s.top + (top - s.top) * .12 : top;
      } else s.top = 0;
      for (const it of s.items) {
        let t = clamp((p - it.a) / (it.b - it.a)); if (!it.lin) t = out3(t);
        if (t > .9985) t = 1; else if (t < .0015) t = 0;
        if (Math.abs(t - it.last) < .0005) continue;
        it.last = t;
        if (it.run) it.run(t); else it.el.style.setProperty(it.mark ? '--m' : '--t', t.toFixed(4));
      }
    }
    scenes.forEach((s) => s.el.classList.toggle('front', s === front));
    if (front.ui !== uiCol || front.bg !== uiBg) { uiCol = front.ui; uiBg = front.bg; html.style.setProperty('--ui', uiCol); html.style.setProperty('--uibg', uiBg); }

    // chapter label, timeline, ring, time
    if (front.i !== chapI) setChap(front.i);
    const T = mode === 'play' ? playT : timeAt(prog);
    for (const c of chapters) {
      const f = Math.round(clamp((T - c.t0) / (c.t1 - c.t0)) * 1000) / 1000;
      if (f !== c.f) { c.f = f; c.seg.style.setProperty('--f', f); }
    }
    ppFill.style.strokeDashoffset = (100 - T / TOTAL * 100).toFixed(2);
    const txt = `${fmt(T)} / ${fmt(TOTAL)}`;
    if (timeEl.textContent !== txt) timeEl.textContent = txt;

    // play badge ring spins faster under the pointer
    if (scenes[0].live && !calm) { ringA = (ringA + dt * (hoverBig ? 75 : 20)) % 360; ring.style.transform = `rotate(${ringA.toFixed(2)}deg)`; }
    if (cur.on) {
      cur.x += (cur.tx - cur.x) * (1 - Math.exp(-dt * 22)); cur.y += (cur.ty - cur.y) * (1 - Math.exp(-dt * 22));
      cur.s += ((cur.hot ? 1.9 : 1) - cur.s) * (1 - Math.exp(-dt * 14));
      cursor.style.transform = `translate3d(${cur.x.toFixed(1)}px, ${cur.y.toFixed(1)}px, 0) scale(${cur.s.toFixed(3)})`;
      cursor.classList.toggle('hot', cur.hot);
    }

    // the cloud: which two shapes, and how far between them
    if (cloud) {
      let ka = keys[0], kb = keys[0], m = 0;
      for (const k of keys) if (prog >= k.at) ka = kb = k;
      for (let j = 1; j < keys.length; j++) {
        const k = keys[j];
        if (prog > k.at - k.w[0] && prog < k.at + k.w[1]) { ka = keys[j - 1]; kb = k; m = (prog - (k.at - k.w[0])) / (k.w[0] + k.w[1]); break; }
      }
      const a = ka.s, b = kb.s;
      const aspect = W / H, e = io(m), pa = place(a, aspect, W, H), pb = place(b, aspect, W, H);
      const text = (s) => s.place === 'name' || s.place === 'top';
      const ry = (s) => (text(s) ? 0 : s.spin * ((prog - s.start) / s.dur - .5));
      const sway = lerp(text(a) ? .35 : 1, text(b) ? .35 : 1, e);
      ptr.sx += ((ptr.on ? ptr.x : 0) - ptr.sx) * .06; ptr.sy += ((ptr.on ? ptr.y : 0) - ptr.sy) * .06;
      cloud.draw({
        from: ka.shape, to: kb.shape, mix: m, time: calm ? 0 : time, chaos: kb.w[0] < .2 ? .4 : .85, kick,
        off: [lerp(pa.off[0], pb.off[0], e), lerp(pa.off[1], pb.off[1], e)], scale: lerp(pa.scale, pb.scale, e),
        ry: lerp(ry(a), ry(b), e) + sway * ((calm ? 0 : Math.sin(time * .5) * .16) + ptr.sx * .35),
        rx: sway * ((calm ? 0 : Math.sin(time * .37) * .07) - ptr.sy * .22),
        size: small ? 2.5 : 3, ptr: ptr.on ? [ptr.x, ptr.y] : [9, 9],
        col: [0, 1, 2].map((k) => lerp(a.col[k], b.col[k], e)), acc: [0, 1, 2].map((k) => lerp(a.acc[k], b.acc[k], e)),
      });
    }
  }

  // the chapter name in the dock rolls like the role lines do
  function setChap(i) {
    const d = i > chapI ? 1 : -1, old = chapEl.lastElementChild, n = document.createElement('span');
    chapI = i; n.textContent = chapters[i].title; chapEl.appendChild(n);
    pp.parentNode.setAttribute('aria-label', `Film controls, ${chapters[i].title}`);
    if (old && !calm && n.animate) {
      const ease = 'cubic-bezier(.2,.8,.2,1)';
      n.animate([{ transform: `translateY(${d * 110}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 480, easing: ease });
      old.animate([{ transform: 'none', opacity: 1 }, { transform: `translateY(${-d * 110}%)`, opacity: 0 }], { duration: 480, easing: ease, fill: 'forwards' }).onfinish = () => old.remove();
    } else if (old) old.remove();
    if (menuOpen) chapters.forEach((c) => c.mi.classList.toggle('now', c.i === i));
  }

  let rt = 0;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (innerWidth === vw && Math.abs(innerHeight - unit) < unit * .18) { if (cloud) cloud.resize(small ? 1.75 : 2); return; } // phone toolbar showing or hiding
      const keep = prog; layout();
      if ((innerWidth / innerHeight > 1.15) !== wideName) buildShapes();
      drive(keep); lastSet = -1;
    }, 160);
  });

  /* ---------- go ---------- */
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.__film = { get prog() { return prog; }, get mode() { return mode; }, TOTAL, rests, zones, chapters: chapters.map((c) => [c.title, c.t0, c.t1]), maxProg };
  const fonts = document.fonts && document.fonts.load ? Promise.all([document.fonts.load('900 100px Anybody'), document.fonts.load('italic 400 40px Fraunces')]) : Promise.resolve();
  let started = false;
  const go = () => {
    if (started) return; started = true; layout(); buildShapes(); html.classList.add('ready'); scrollTo(0, 0); requestAnimationFrame(update);
    setTimeout(() => html.classList.add('intro-done'), 2600); // the title's entrance plays once, not every time you come back to it
  };
  Promise.race([fonts, new Promise((r) => setTimeout(r, 3000))]).then(go, go);
})();
