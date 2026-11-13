/* Force-directed skills graph: repulsion between nodes, springs along edges,
   signals travelling the edges. Drag nodes with a mouse or finger. */
window.AV = window.AV || {};
AV.createGraph = function (canvas, mobile) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const COL = ['#ff5c9e', '#52e0ff', '#ffb84a', '#8b6cff'];
  const groups = [
    ['Generative AI', ['LLMs', 'RAG', 'Fine-tuning', 'Knowledge graphs', 'Whisper', 'Stable Diffusion', 'Agent skills']],
    ['Cloud and infra', ['AWS', 'Terraform', 'Docker', 'Kubernetes', 'GitHub Actions', 'OpenTelemetry', 'DevOps']],
    ['Data', ['Snowflake', 'SQL', 'PL/SQL', 'MongoDB', 'Neptune']],
    ['Applications', ['Python', 'React', 'Chrome extensions']],
  ];
  const cross = [['Terraform', 'AWS'], ['AWS', 'Neptune'], ['Neptune', 'Knowledge graphs'], ['Python', 'LLMs'], ['RAG', 'Snowflake'],
    ['React', 'Chrome extensions'], ['Docker', 'Kubernetes'], ['GitHub Actions', 'DevOps'], ['SQL', 'PL/SQL'], ['SQL', 'Snowflake'],
    ['OpenTelemetry', 'AWS'], ['Python', 'Fine-tuning'], ['Agent skills', 'Terraform'], ['Chrome extensions', 'LLMs'], ['RAG', 'Knowledge graphs']];
  const anchors = [[0.27, 0.3], [0.73, 0.32], [0.7, 0.76], [0.28, 0.76]];
  const nodes = [], edges = [], byName = {};
  groups.forEach(([hub, items], g) => {
    const h = { name: hub, g, hub: true, x: 0, y: 0, vx: 0, vy: 0, nb: [] }; nodes.push(h); byName[hub] = h;
    items.forEach((name) => { const n = { name, g, hub: false, x: 0, y: 0, vx: 0, vy: 0, nb: [] }; nodes.push(n); byName[name] = n; edges.push({ a: h, b: n, len: 1, ph: Math.random() }); });
  });
  cross.forEach(([a, b]) => edges.push({ a: byName[a], b: byName[b], len: 1.5, ph: Math.random(), cross: true }));
  for (let g = 0; g < 4; g++) edges.push({ a: nodes.find((n) => n.hub && n.g === g), b: nodes.find((n) => n.hub && n.g === (g + 1) % 4), len: 2.6, ph: Math.random(), cross: true });
  edges.forEach((e) => { e.a.nb.push(e.b); e.b.nb.push(e.a); });

  let W = 1, H = 1, dpr = 1, unit = 80, placed = false, t = 0;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    unit = Math.max(52, Math.min(W, H) * (mobile ? 0.2 : 0.17));
    if (!placed) {
      nodes.forEach((n) => { const a = anchors[n.g]; n.x = W * a[0] + (Math.random() - .5) * 120; n.y = H * a[1] + (Math.random() - .5) * 120; });
      placed = true;
    }
  }

  let drag = null, hover = null;
  const ptr = { x: -999, y: -999 };
  function pick(x, y) {
    let best = null, bd = mobile ? 34 : 26;
    for (const n of nodes) { const d = Math.hypot(n.x - x, n.y - y); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  function local(e) { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  canvas.addEventListener('pointerdown', (e) => {
    const [x, y] = local(e); const n = pick(x, y);
    if (n) { drag = n; hover = n; canvas.classList.add('dragging'); try { canvas.setPointerCapture(e.pointerId); } catch (_) {} }
  });
  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = local(e); ptr.x = x; ptr.y = y;
    if (drag) { drag.x = x; drag.y = y; drag.vx = drag.vy = 0; } else hover = pick(x, y);
  });
  const end = () => { drag = null; canvas.classList.remove('dragging'); };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => { if (!drag) hover = null; ptr.x = ptr.y = -999; });

  function frame(dt) {
    t += dt;
    const f = Math.min(2, dt * 60);
    // physics
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y; const d2 = dx * dx + dy * dy + 40;
        const k = unit * unit * 0.55 / d2; const d = Math.sqrt(d2);
        dx = dx / d * k; dy = dy / d * k;
        a.vx += dx; a.vy += dy; b.vx -= dx; b.vy -= dy;
      }
      const an = anchors[a.g], pull = a.hub ? 0.012 : 0.0025;
      a.vx += (W * an[0] - a.x) * pull; a.vy += (H * an[1] - a.y) * pull;
      a.vx += Math.sin(t * 0.7 + i) * 0.02; a.vy += Math.cos(t * 0.6 + i * 1.7) * 0.02;
    }
    for (const e of edges) {
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, d = Math.hypot(dx, dy) + 0.01;
      const k = (d - e.len * unit) * (e.cross ? 0.004 : 0.02);
      const fx = dx / d * k, fy = dy / d * k;
      e.a.vx += fx; e.a.vy += fy; e.b.vx -= fx; e.b.vy -= fy;
    }
    const m = 34, mx = mobile ? 52 : 60;
    for (const n of nodes) {
      if (n === drag) continue;
      n.vx *= 0.86; n.vy *= 0.86;
      n.x += n.vx * f; n.y += n.vy * f;
      if (n.x < mx) { n.x = mx; n.vx *= -0.5; } else if (n.x > W - mx) { n.x = W - mx; n.vx *= -0.5; }
      if (n.y < m) { n.y = m; n.vy *= -0.5; } else if (n.y > H - m) { n.y = H - m; n.vy *= -0.5; }
    }

    // draw
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const focus = drag || hover;
    ctx.lineCap = 'round';
    for (const e of edges) {
      const on = focus && (e.a === focus || e.b === focus);
      ctx.globalAlpha = focus ? (on ? 0.95 : 0.08) : (e.cross ? 0.16 : 0.32);
      ctx.strokeStyle = on ? '#fff' : COL[e.a.g]; ctx.lineWidth = on ? 1.8 : 1;
      ctx.beginPath(); ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y); ctx.stroke();
      // signal travelling along the edge
      const u = (t * (e.cross ? 0.18 : 0.3) + e.ph) % 1;
      ctx.globalAlpha = focus ? (on ? 1 : 0.1) : 0.9;
      ctx.fillStyle = COL[e.b.g];
      ctx.beginPath(); ctx.arc(e.a.x + (e.b.x - e.a.x) * u, e.a.y + (e.b.y - e.a.y) * u, on ? 2.6 : 1.7, 0, 6.283); ctx.fill();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const n of nodes) {
      const on = !focus || n === focus || focus.nb.indexOf(n) >= 0;
      const r = n.hub ? (mobile ? 9 : 12) : (mobile ? 4.5 : 5.5);
      ctx.globalAlpha = on ? 1 : 0.18;
      const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 4);
      glow.addColorStop(0, COL[n.g] + 'aa'); glow.addColorStop(1, COL[n.g] + '00');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(n.x, n.y, r * 4, 0, 6.283); ctx.fill();
      ctx.fillStyle = n === focus ? '#fff' : COL[n.g];
      ctx.beginPath(); ctx.arc(n.x, n.y, r * (n === focus ? 1.35 : 1), 0, 6.283); ctx.fill();
      ctx.fillStyle = '#eef0fc';
      ctx.font = n.hub ? `700 ${mobile ? 15 : 19}px "Bricolage Grotesque", system-ui, sans-serif` : `500 ${mobile ? 12 : 14}px "Hanken Grotesk", system-ui, sans-serif`;
      const tw = ctx.measureText(n.name).width / 2 + 8;
      ctx.fillText(n.name, Math.min(W - tw, Math.max(tw, n.x)), n.y - r - (n.hub ? 14 : 11));
    }
    ctx.globalAlpha = 1;
  }

  resize();
  for (let i = 0; i < 200; i++) { /* settle before first paint */ const s = t; frame(1 / 60); t = s; }
  return { frame, resize };
};
