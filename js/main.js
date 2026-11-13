(function () {
  const html = document.documentElement;
  html.classList.add('js');
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const coarse = matchMedia('(pointer: coarse)').matches;
  const mobile = coarse || innerWidth < 820;
  let motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- headings: split into words ---------- */
  $$('[data-split]').forEach((h) => {
    const words = h.textContent.trim().split(/\s+/);
    h.setAttribute('aria-label', words.join(' '));
    h.innerHTML = words.map((w, i) => `<span class="w" aria-hidden="true"><i style="--i:${i}">${w}</i></span>`).join(' ');
  });
  const seen = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); seen.unobserve(e.target); } }), { threshold: 0.3 });
  $$('[data-split]').forEach((h) => seen.observe(h));

  /* ---------- counters ---------- */
  const counted = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    counted.unobserve(e.target);
    if (!motion) return;
    $$('[data-count]', e.target).forEach((el, i) => {
      const to = +el.dataset.count, sep = el.hasAttribute('data-sep'), t0 = performance.now() + i * 120, dur = 1500;
      el.textContent = '0';
      (function run(now) {
        const k = clamp((now - t0) / dur, 0, 1), v = Math.round(to * (1 - Math.pow(2, -10 * k)) / (1 - Math.pow(2, -10)));
        el.textContent = sep ? v.toLocaleString('en-US') : v;
        if (k < 1) requestAnimationFrame(run);
      })(performance.now());
    });
  }), { threshold: 0.4 });
  $$('.num').forEach((n) => counted.observe(n));

  /* ---------- glass: pointer light and tilt ---------- */
  if (!coarse) {
    $$('.glass').forEach((el) => {
      const tilt = el.hasAttribute('data-tilt');
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        el.style.setProperty('--mx', x + 'px'); el.style.setProperty('--my', y + 'px');
        if (tilt && motion) { el.style.setProperty('--rx', ((0.5 - y / r.height) * 5).toFixed(2) + 'deg'); el.style.setProperty('--ry', ((x / r.width - 0.5) * 6).toFixed(2) + 'deg'); }
        el.classList.add('lit');
      });
      el.addEventListener('pointerleave', () => { el.classList.remove('lit'); el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
    });
  }

  /* ---------- timeline path ---------- */
  const tl = $('#timeline'), tlSvg = $('.tl-svg'), tlTrack = $('.tl-track'), tlLine = $('.tl-line'), tlHead = $('.tl-head'), roles = $$('.role');
  let tlLen = 0;
  function layoutTimeline() {
    const h = tl.offsetHeight, w = tlSvg.clientWidth || 64, cx = w / 2, amp = w * 0.42;
    const ys = [0].concat(roles.map((r) => r.offsetTop + (mobile ? 12 : 36)), [h]);
    let d = `M ${cx} 0`;
    for (let i = 1; i < ys.length; i++) {
      const y0 = ys[i - 1], dy = ys[i] - y0, s = i % 2 ? 1 : -1;
      d += ` C ${cx + amp * s} ${y0 + dy * 0.3}, ${cx + amp * s} ${y0 + dy * 0.7}, ${cx} ${ys[i]}`;
    }
    tlTrack.setAttribute('d', d); tlLine.setAttribute('d', d);
    tlLen = tlLine.getTotalLength();
    tlLine.style.strokeDasharray = tlLen;
    $$('.tl-node', tlSvg).forEach((n) => n.remove());
    roles.forEach((r, i) => {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('class', 'tl-node'); c.setAttribute('cx', cx); c.setAttribute('cy', ys[i + 1]); c.setAttribute('r', 5);
      c.setAttribute('fill', '#060818'); c.setAttribute('stroke', 'rgba(255,255,255,.5)'); c.setAttribute('stroke-width', 2);
      tlSvg.appendChild(c);
    });
  }
  function updateTimeline(vh) {
    const r = tl.getBoundingClientRect();
    if (r.bottom < -200 || r.top > vh + 200) return;
    const p = clamp((vh * 0.6 - r.top) / r.height, 0, 1);
    tlLine.style.strokeDashoffset = tlLen * (1 - p);
    const pt = tlLine.getPointAtLength(tlLen * p);
    tlHead.style.transform = `translate3d(${pt.x}px,${pt.y}px,0)`;
    roles.forEach((role) => role.classList.toggle('on', pt.y >= role.offsetTop - 10));
  }

  /* ---------- pinned horizontal systems ---------- */
  const sys = $('#systems'), sysPin = $('.sys-pin'), sysTrack = $('#sys-track'), sysIdx = $('#sys-idx'), sysCards = $$('.sys');
  let sysDist = 0, skew = 0;
  function layoutSystems() {
    if (!html.classList.contains('js-pin')) { sys.style.height = ''; sysTrack.style.transform = ''; return; }
    sysDist = Math.max(0, sysTrack.scrollWidth - innerWidth);
    sys.style.height = sysPin.offsetHeight + sysDist + 'px';
  }
  function updateSystems(vh, vel) {
    const r = sys.getBoundingClientRect();
    if (r.bottom < -100 || r.top > vh + 100) return;
    const p = clamp(-r.top / Math.max(1, r.height - sysPin.offsetHeight), 0, 1);
    sysTrack.style.transform = `translate3d(${(-p * sysDist).toFixed(1)}px,0,0)`;
    skew += (clamp(vel * -0.12, -7, 7) - skew) * 0.15;
    sysTrack.style.setProperty('--skew', skew.toFixed(2) + 'deg');
    sysIdx.textContent = Math.round(p * (sysCards.length - 1)) + 1;
  }

  /* ---------- trace + contact ---------- */
  const trace = $('#trace'), traceFig = $('.trace-fig'), contactTitle = $('#contact-title');
  function updateTrace(vh) {
    const r = traceFig.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh) return;
    trace.style.setProperty('--p', clamp((vh * 0.9 - r.top) / (vh * 0.55), 0, 1).toFixed(3));
  }
  function updateContact(vh) {
    const r = contactTitle.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh) return;
    const p = clamp((vh - r.top) / (vh * 0.75), 0, 1);
    contactTitle.style.setProperty('--w', Math.round(200 + 600 * p));
    contactTitle.style.setProperty('--gx', (1 - p).toFixed(3));
  }

  /* ---------- simulations ---------- */
  const fluidCanvas = $('#fluid'), nameCanvas = $('#name-canvas'), heading = $('#hero-name'), hero = $('#hero'), graphCanvas = $('#graph');
  let fluid = null, fluidTried = false, particles = null, graph = null, graphVisible = false;
  const PAL = [[0.1, 0.72, 1], [0.5, 0.28, 1], [1, 0.22, 0.55], [1, 0.58, 0.12]];
  let sp = 0;
  function colour(k) {
    const base = Math.floor(sp * 9) % 4, c = PAL[Math.random() < 0.65 ? base : (Math.random() * 4) | 0];
    return [c[0] * k, c[1] * k, c[2] * k];
  }
  function startFluid() {
    if (fluidTried) return; fluidTried = true;
    try { fluid = AV.createFluid(fluidCanvas, mobile); } catch (e) { fluid = null; }
    if (!fluid) return;
    fluid.setGain(mobile ? 0.72 : 0.9);
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * 6.283;
      fluid.splat(0.15 + Math.random() * 0.7, 0.2 + Math.random() * 0.6, Math.cos(a) * 900, Math.sin(a) * 900, colour(0.5), 2.2);
    }
  }
  function startParticles() {
    if (particles) return;
    particles = AV.createParticles(nameCanvas, heading, mobile);
    if (!particles) return;
    const go = () => { if (particles.sample()) html.classList.add('fx-particles'); };
    const fonts = document.fonts && document.fonts.load ? document.fonts.load('800 100px "Bricolage Grotesque"') : Promise.resolve();
    Promise.race([fonts, new Promise((r) => setTimeout(r, 2500))]).then(go, go);
  }
  graph = AV.createGraph(graphCanvas, mobile);
  new IntersectionObserver((es) => { graphVisible = es[0].isIntersecting; }, { rootMargin: '100px' }).observe(graphCanvas);

  /* ---------- input ---------- */
  const input = { x: 0, y: 0, dx: 0, dy: 0, moved: false, has: false };
  function move(x, y) {
    if (input.has) { input.dx += x - input.x; input.dy += y - input.y; input.moved = true; }
    input.x = x; input.y = y; input.has = true;
    if (particles) particles.pointer(x, y + scrollY);
  }
  addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') move(e.clientX, e.clientY); }, { passive: true });
  addEventListener('touchstart', (e) => { input.has = false; const t = e.touches[0]; move(t.clientX, t.clientY); }, { passive: true });
  addEventListener('touchmove', (e) => { const t = e.touches[0]; move(t.clientX, t.clientY); }, { passive: true });
  addEventListener('touchend', () => { input.has = false; if (particles) particles.pointerOut(); }, { passive: true });
  document.addEventListener('pointerleave', () => { input.has = false; if (particles) particles.pointerOut(); });

  /* ---------- main loop ---------- */
  let raf = 0, last = 0, lastY = scrollY, ambient = 0, msAvg = 16;
  const progress = $('.progress');
  function tick(now) {
    raf = requestAnimationFrame(tick);
    const ms = last ? now - last : 16; last = now;
    if (ms > 200) return;
    msAvg += (ms - msAvg) * 0.05;
    const dt = Math.min(0.05, ms / 1000), vh = innerHeight, y = scrollY, dy = y - lastY; lastY = y;
    sp = clamp(y / Math.max(1, document.documentElement.scrollHeight - vh), 0, 1);
    progress.style.setProperty('--sp', sp.toFixed(4));

    updateTimeline(vh); updateSystems(vh, dy); updateTrace(vh); updateContact(vh);

    if (fluid) {
      const W = innerWidth;
      if (input.moved) {
        const speed = Math.hypot(input.dx, input.dy);
        fluid.splat(input.x / W, 1 - input.y / vh, input.dx / W * 5200, -input.dy / vh * 5200, colour(Math.min(0.5, 0.08 + speed * 0.012)), 1);
        input.dx = input.dy = 0; input.moved = false;
      }
      if (Math.abs(dy) > 1) {
        const v = clamp(dy, -90, 90), k = Math.min(0.42, Math.abs(v) * 0.012);
        fluid.splat(0.1 + Math.random() * 0.8, v > 0 ? 0.04 : 0.96, (Math.random() - 0.5) * 500, v * 26, colour(k), 2.4);
      }
      ambient -= dt;
      if (ambient <= 0) {
        ambient = 0.7 + Math.random() * 0.9;
        const a = Math.random() * 6.283, m = 350 + Math.random() * 500;
        fluid.splat(Math.random(), Math.random(), Math.cos(a) * m, Math.sin(a) * m, colour(0.42), 2.6);
      }
      fluid.frame(dt, msAvg);
    }
    if (particles) {
      const hh = hero.offsetHeight;
      if (y < hh) {
        const k = clamp((y / hh - 0.04) / 0.7, 0, 1);
        particles.frame(dt, k * k * (3 - 2 * k));
      }
    }
    if (graph && graphVisible) graph.frame(dt);
  }
  function start() { if (!raf) { last = 0; lastY = scrollY; raf = requestAnimationFrame(tick); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  /* ---------- motion on/off ---------- */
  const toggle = $('.motion-toggle'), toggleLabel = $('.mt-label');
  function applyMotion() {
    html.classList.toggle('no-motion', !motion);
    html.classList.toggle('js-pin', motion);
    toggle.setAttribute('aria-pressed', String(!motion));
    toggleLabel.textContent = motion ? 'Pause motion' : 'Play motion';
    toggle.setAttribute('aria-label', motion ? 'Pause motion' : 'Play motion');
    layoutSystems(); layoutTimeline();
    if (motion) { startFluid(); startParticles(); start(); }
    else {
      stop();
      tlLine.style.strokeDashoffset = 0; tlHead.style.transform = 'translate3d(-99px,0,0)';
      trace.style.setProperty('--p', 1); contactTitle.style.setProperty('--w', 800); contactTitle.style.setProperty('--gx', 0);
      if (graph) graph.frame(1 / 60);
    }
  }
  toggle.addEventListener('click', () => { motion = !motion; applyMotion(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (motion) start(); });

  let rw = innerWidth, rt = 0;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      layoutTimeline(); layoutSystems();
      if (fluid) fluid.resize();
      if (graph) { graph.resize(); if (!motion) graph.frame(1 / 60); }
      if (particles && innerWidth !== rw) { rw = innerWidth; particles.sample(); }
    }, 150);
  });
  addEventListener('load', () => { layoutTimeline(); layoutSystems(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { layoutTimeline(); layoutSystems(); });

  applyMotion();
})();
