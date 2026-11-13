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
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = coarse || innerWidth < 820;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SPEED = 0.38;          // scenes per second on autoplay
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
    const [from, to] = el.dataset.odo.split(',').map(Number), digits = String(Math.max(from, to)).length, sep = el.hasAttribute('data-sep');
    el.classList.add('odo'); const cols = [];
    for (let k = digits - 1; k >= 0; k--) {
      const col = document.createElement('span'); col.className = 'col'; col.setAttribute('aria-hidden', 'true');
      for (let d = 0; d <= 10; d++) { const s = document.createElement('span'); s.textContent = d % 10; col.appendChild(s); }
      el.appendChild(col); cols[k] = col;
      if (sep && k === 3) { const c = document.createElement('span'); c.textContent = ','; c.setAttribute('aria-hidden', 'true'); el.appendChild(c); }
    }
    return (t) => {
      const v = from + (to - from) * t;
      for (let k = 0; k < digits; k++) {
        const unit = Math.pow(10, k), f = v / unit, base = Math.floor(f + 1e-9), frac = f - base;
        const roll = k === 0 ? frac : clamp((frac - (1 - 1 / unit)) * unit, 0, 1);
        cols[k].style.setProperty('--d', ((base % 10) + (to - from > 500 && k < 2 && t < 1 ? frac : roll)).toFixed(3));
      }
    };
  }

  /* ---------- role title that decodes itself as the year rolls ---------- */
  function roles(el) {
    const list = el.dataset.roles.split('|').map((s) => { const i = s.indexOf(':'); return [+s.slice(0, i), s.slice(i + 1)]; });
    const first = list[0][0], span = list[list.length - 1][0] - first, GL = 'ABCDEFGHJKLMNPQRSTUVWXYZ#/<>*+=';
    let last = '';
    return (t) => {
      const year = first + span * clamp(t / .86); let k = 0;
      for (let i = 0; i < list.length; i++) if (year >= list[i][0] - .001) k = i;
      const word = list[k][1], tick = Math.floor(t * 210);
      const local = k === 0 ? 1 : k === list.length - 1 ? clamp((t - .86) / .12) : clamp((year - list[k][0]) / .42);
      let s = '';
      for (let i = 0; i < word.length; i++) {
        if (word[i] === ' ' || i < local * word.length) s += word[i];
        else s += GL[(i * 7 + tick * 13 + k * 5) % GL.length];
      }
      if (s !== last) { el.textContent = s; last = s; }
    };
  }

  /* ---------- scenes ---------- */
  let acc = 0;
  const scenes = $$('.scene').map((el, i) => {
    const s = {
      el, i, dur: +el.dataset.dur, start: acc, wipe: el.dataset.wipe, origin: el.dataset.origin, shape: el.dataset.shape,
      col: COL[el.dataset.ink], acc: COL[el.dataset.accent], place: el.dataset.place, spin: +(el.dataset.spin || 0),
      ui: UI[Array.from(el.classList).find((c) => UI[c])], live: false, clip: '', center: null,
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
  let nameHalf = 3.5;
  function place(kind, aspect) {
    const wide = aspect > 1;
    if (kind === 'name') return { off: [0, wide ? .16 : .24], scale: (wide ? .86 * aspect : .9) / nameHalf, spin: 0 };
    if (kind === 'top') return wide ? { off: [0, .42], scale: .4 } : { off: [0, .46], scale: .52 };
    if (kind === 'center') return { off: [0, 0], scale: wide ? .78 : .8 };
    return wide ? { off: [.47, 0], scale: .56 } : { off: [0, .4], scale: .6 };
  }

  /* ---------- set up ---------- */
  const stage = $('#stage'), track = $('#track'), canvas = $('#cloud'), pp = $('#pp'), seek = $('#seek'), timeEl = $('#time');
  const N = small ? 16000 : 42000;
  const cloud = AV.createCloud(canvas, N);
  let unit = innerHeight, vw = innerWidth, wideName = innerWidth / innerHeight > 1.15;

  function layout() {
    unit = innerHeight; vw = innerWidth;
    track.style.height = Math.round(maxProg * unit + innerHeight + 2) + 'px';
    scenes.forEach((s) => { s.center = null; s.clip = ''; });
    if (cloud) cloud.resize(small ? 1.75 : 2);
  }
  function buildShapes() {
    if (!cloud) return;
    wideName = innerWidth / innerHeight > 1.15;
    nameHalf = wideName ? 1500 / 420 : 760 / 520;
    cloud.build(['AADITYA', 'VERMA'], wideName);
  }

  let prog = 0, playing = false, playY = 0, lastSet = -1, time = 0, last = 0, uiCol = '';
  const ptr = { x: 9, y: 9, sx: 0, sy: 0, on: false };

  function update(now) {
    requestAnimationFrame(update);
    const dt = Math.min(.05, (now - last) / 1000 || .016); last = now; time += dt;
    const maxY = maxProg * unit;

    if (playing) {
      if (lastSet >= 0 && Math.abs(scrollY - lastSet) > 6) setPlaying(false);         // the viewer took over
      else { playY = Math.min(maxY, playY + SPEED * unit * dt); scrollTo(0, playY); lastSet = Math.round(playY); if (playY >= maxY) setPlaying(false); }
    }
    const target = clamp(scrollY / unit, 0, maxProg);
    prog = playing ? clamp(playY / unit, 0, maxProg) : prog + (target - prog) * (1 - Math.exp(-dt * 10));
    if (Math.abs(target - prog) < .0004) prog = target;

    const W = vw, H = innerHeight;
    let front = scenes[0];
    for (const s of scenes) {
      const live = prog >= s.start - PRE && (s === lastScene || prog < s.end + POST);
      if (live !== s.live) { s.live = live; s.el.classList.toggle('live', live); }
      if (!live) continue;
      const p = (prog - s.start) / s.dur;
      s.el.style.setProperty('--p', clamp(p).toFixed(4));
      s.el.style.setProperty('--x', s === lastScene ? 0 : clamp((prog - (s.end - .34)) / .5).toFixed(4));
      if (s.i > 0) {
        const w = clamp((prog - (s.start - PRE)) / (PRE + POST));
        const clip = w >= 1 ? 'none' : wipe(s, io(w), W, H);
        if (clip !== s.clip) { s.clip = clip; s.el.style.clipPath = clip; s.el.style.webkitClipPath = clip; }
        if (w > .5) front = s;
      }
      for (const it of s.items) {
        let t = clamp((p - it.a) / (it.b - it.a)); if (!it.lin) t = out3(t);
        if (t > .9985) t = 1; else if (t < .0015) t = 0;
        if (Math.abs(t - it.last) < .0005) continue;
        it.last = t;
        if (it.run) it.run(t); else it.el.style.setProperty(it.mark ? '--m' : '--t', t.toFixed(4));
      }
    }
    scenes.forEach((s) => s.el.classList.toggle('front', s === front));
    if (front.ui !== uiCol) { uiCol = front.ui; html.style.setProperty('--ui', uiCol); }

    // player read-out
    seek.style.setProperty('--sp', (prog / maxProg).toFixed(4));
    const sec = Math.round(prog / SPEED), tot = Math.round(maxProg / SPEED);
    const txt = `${sec / 60 | 0}:${String(sec % 60).padStart(2, '0')} / ${tot / 60 | 0}:${String(tot % 60).padStart(2, '0')}`;
    if (timeEl.textContent !== txt) { timeEl.textContent = txt; seek.setAttribute('aria-valuenow', Math.round(prog / maxProg * 100)); }

    // the cloud: which two shapes, and how far between them
    if (cloud) {
      let a = scenes[0], b = scenes[0], m = 0;
      for (const s of scenes) if (prog >= s.start) a = b = s;
      for (let j = 1; j < scenes.length; j++) {
        const st = scenes[j].start;
        if (prog > st - .34 && prog < st + .3) { a = scenes[j - 1]; b = scenes[j]; m = (prog - (st - .34)) / .64; break; }
      }
      const aspect = W / H, e = io(m), pa = place(a.place, aspect), pb = place(b.place, aspect);
      const text = (s) => s.place === 'name' || s.place === 'top';
      const ry = (s) => (text(s) ? 0 : s.spin * ((prog - s.start) / s.dur - .5));
      const sway = lerp(text(a) ? .35 : 1, text(b) ? .35 : 1, e);
      ptr.sx += ((ptr.on ? ptr.x : 0) - ptr.sx) * .06; ptr.sy += ((ptr.on ? ptr.y : 0) - ptr.sy) * .06;
      cloud.draw({
        from: a.shape, to: b.shape, mix: m, time: calm ? 0 : time, chaos: .85,
        off: [lerp(pa.off[0], pb.off[0], e), lerp(pa.off[1], pb.off[1], e)], scale: lerp(pa.scale, pb.scale, e),
        ry: lerp(ry(a), ry(b), e) + sway * ((calm ? 0 : Math.sin(time * .5) * .16) + ptr.sx * .35),
        rx: sway * ((calm ? 0 : Math.sin(time * .37) * .07) - ptr.sy * .22),
        size: small ? 2.5 : 3, ptr: ptr.on ? [ptr.x, ptr.y] : [9, 9],
        col: [0, 1, 2].map((k) => lerp(a.col[k], b.col[k], e)), acc: [0, 1, 2].map((k) => lerp(a.acc[k], b.acc[k], e)),
      });
    }
  }

  /* ---------- play / pause / seek ---------- */
  function setPlaying(on) {
    if (on && scrollY >= maxProg * unit - 4) { scrollTo(0, 0); prog = 0; }
    playing = on; playY = scrollY; lastSet = -1;
    html.classList.toggle('playing', on);
    pp.setAttribute('aria-label', on ? 'Pause' : 'Play');
  }
  pp.addEventListener('click', () => setPlaying(!playing));
  $('#big-play').addEventListener('click', () => setPlaying(true));
  $('#home').addEventListener('click', (e) => { e.preventDefault(); setPlaying(false); scrollTo(0, 0); });
  function seekTo(f) { setPlaying(false); scrollTo(0, clamp(f) * maxProg * unit); }
  seek.addEventListener('click', (e) => { const r = seek.getBoundingClientRect(); seekTo((e.clientX - r.left) / r.width); });
  seek.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); seekTo(prog / maxProg + (e.key === 'ArrowRight' ? .03 : -.03)); }
  });
  addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !/^(A|BUTTON)$/.test(document.activeElement.tagName) && document.activeElement !== seek) { e.preventDefault(); setPlaying(!playing); }
  });
  ['wheel', 'touchmove'].forEach((ev) => addEventListener(ev, () => { if (playing) setPlaying(false); }, { passive: true }));
  document.addEventListener('visibilitychange', () => { if (document.hidden && playing) setPlaying(false); });

  /* ---------- pointer pushes the particles ---------- */
  function point(x, y) { ptr.x = x / innerWidth * 2 - 1; ptr.y = 1 - y / innerHeight * 2; ptr.on = true; }
  addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') point(e.clientX, e.clientY); }, { passive: true });
  addEventListener('touchstart', (e) => point(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  addEventListener('touchmove', (e) => point(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  addEventListener('touchend', () => { ptr.on = false; }, { passive: true });
  document.addEventListener('pointerleave', () => { ptr.on = false; });

  let rt = 0;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (innerWidth === vw && Math.abs(innerHeight - unit) < unit * .18) { if (cloud) cloud.resize(small ? 1.75 : 2); return; } // phone toolbar showing or hiding
      const keep = prog; layout();
      if ((innerWidth / innerHeight > 1.15) !== wideName) buildShapes();
      scrollTo(0, keep * unit);
    }, 160);
  });

  /* ---------- go ---------- */
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const fonts = document.fonts && document.fonts.load ? Promise.all([document.fonts.load('900 100px Anybody'), document.fonts.load('italic 400 40px Fraunces')]) : Promise.resolve();
  const begin = () => { layout(); buildShapes(); html.classList.add('ready'); requestAnimationFrame(update); };
  Promise.race([fonts, new Promise((r) => setTimeout(r, 3000))]).then(begin, begin);
})();
