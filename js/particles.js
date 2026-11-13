/* The name in the hero is drawn by particles. Each one is pulled to a point sampled
   from the real <h1> text, pushed around by the pointer, and released as you scroll. */
window.AV = window.AV || {};
AV.createParticles = function (canvas, heading, mobile) {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false });
  if (!gl) return null;

  const N = mobile ? 13000 : 36000;
  const pos = new Float32Array(N * 2), vel = new Float32Array(N * 2), tgt = new Float32Array(N * 2);
  const meta = new Float32Array(N * 2); // colour position, random
  const free = new Uint8Array(N);

  const vs = `attribute vec2 aP; attribute vec2 aM; uniform vec2 res; uniform float size, fade;
    varying vec3 vC; varying float vA;
    vec3 pal(float t){ vec3 a = vec3(.32,.88,1.), b = vec3(.62,.5,1.), c = vec3(1.,.42,.66), d = vec3(1.,.76,.36);
      return t < .4 ? mix(a, b, t / .4) : t < .75 ? mix(b, c, (t - .4) / .35) : mix(c, d, (t - .75) / .25); }
    void main(){ vec2 c = aP / res * 2. - 1.; gl_Position = vec4(c.x, -c.y, 0., 1.);
      gl_PointSize = size * (.55 + aM.y * 1.1); vC = mix(pal(aM.x), vec3(1.), aM.y * aM.y * .55); vA = fade * (.5 + .5 * aM.y); }`;
  const fs = `precision mediump float; varying vec3 vC; varying float vA;
    void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, .05, d) * vA; gl_FragColor = vec4(vC * a, a); }`;
  function sh(t, s) { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; }
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
  gl.useProgram(p);
  const uRes = gl.getUniformLocation(p, 'res'), uSize = gl.getUniformLocation(p, 'size'), uFade = gl.getUniformLocation(p, 'fade');
  const aP = gl.getAttribLocation(p, 'aP'), aM = gl.getAttribLocation(p, 'aM');
  const posBuf = gl.createBuffer(), metaBuf = gl.createBuffer();
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);

  let W = 1, H = 1, dpr = 1, ready = false;

  function sample() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);

    // draw the heading text into an offscreen canvas exactly where the DOM puts it
    const k = Math.min(1, 900 / W); // sample at reduced scale on big screens
    const off = document.createElement('canvas');
    off.width = Math.ceil(W * k); off.height = Math.ceil(H * k);
    const c = off.getContext('2d', { willReadFrequently: true });
    const cs = getComputedStyle(heading), box = canvas.getBoundingClientRect();
    const fpx = parseFloat(cs.fontSize);
    c.scale(k, k);
    c.font = `${cs.fontWeight} ${fpx}px ${cs.fontFamily}`;
    if ('fontStretch' in c) c.fontStretch = 'condensed';
    if ('letterSpacing' in c) c.letterSpacing = cs.letterSpacing;
    c.textBaseline = 'alphabetic'; c.fillStyle = '#fff';
    heading.querySelectorAll('span').forEach((s) => {
      const r = s.getBoundingClientRect(), text = s.textContent;
      const m = c.measureText(text);
      const sx = r.width / Math.max(1, m.width); // match DOM width even if canvas ignores font-stretch
      const asc = m.fontBoundingBoxAscent || fpx * 0.9, desc = m.fontBoundingBoxDescent || fpx * 0.25;
      const base = r.top - box.top + (r.height - (asc + desc)) / 2 + asc;
      c.save(); c.translate(r.left - box.left, base); c.scale(sx, 1); c.fillText(text, 0, 0); c.restore();
    });
    const img = c.getImageData(0, 0, off.width, off.height).data;
    const pts = [];
    for (let y = 0; y < off.height; y++) for (let x = 0; x < off.width; x++) if (img[(y * off.width + x) * 4 + 3] > 128) pts.push(x, y);
    const count = pts.length / 2;
    if (!count) return false;

    let minX = 1e9, maxX = -1e9;
    for (let i = 0; i < pts.length; i += 2) { if (pts[i] < minX) minX = pts[i]; if (pts[i] > maxX) maxX = pts[i]; }
    for (let i = 0; i < N; i++) {
      const isFree = i % 9 === 0;
      free[i] = isFree ? 1 : 0;
      const j = (Math.random() * count | 0) * 2;
      const tx = isFree ? Math.random() * W : (pts[j] + Math.random()) / k;
      const ty = isFree ? Math.random() * H : (pts[j + 1] + Math.random()) / k;
      tgt[i * 2] = tx; tgt[i * 2 + 1] = ty;
      if (!ready) {
        const a = Math.random() * 6.283, r = Math.max(W, H) * (0.3 + Math.random() * 0.7);
        pos[i * 2] = W / 2 + Math.cos(a) * r; pos[i * 2 + 1] = H / 2 + Math.sin(a) * r;
        meta[i * 2 + 1] = Math.random();
      }
      meta[i * 2] = isFree ? Math.random() : Math.min(1, Math.max(0, (pts[j] - minX) / Math.max(1, maxX - minX) + (Math.random() - .5) * .12));
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, metaBuf); gl.bufferData(gl.ARRAY_BUFFER, meta, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aM); gl.vertexAttribPointer(aM, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);
    ready = true;
    return true;
  }

  let t = 0, intro = 0;
  const ptr = { x: -9999, y: -9999, vx: 0, vy: 0 };

  function frame(dt, release) {
    if (!ready) return;
    t += dt; intro = Math.min(1, intro + dt / 1.8);
    const f = Math.min(2, dt * 60);
    const ease = intro * intro * (3 - 2 * intro);
    const hold = 1 - release;
    const spring = 0.02 * ease * hold * hold;
    const flow = (0.012 + (1 - ease) * 0.5 + release * 0.55);
    const lift = release * 0.5;
    const R = mobile ? 90 : 150, R2 = R * R;
    const damp = Math.pow(0.9, f);
    const px = ptr.x, py = ptr.y;
    for (let i = 0; i < N; i++) {
      const a = i * 2, b = a + 1;
      let x = pos[a], y = pos[b], vx = vel[a], vy = vel[b];
      const s = meta[b];
      const n1 = Math.sin(y * 0.013 + t * 0.7 + s * 6.283), n2 = Math.cos(x * 0.011 - t * 0.6 + s * 4.1);
      if (free[i]) {
        vx += (n1 * 0.05 + 0.02) * f; vy += (n2 * 0.05 - 0.015 - lift * 0.4) * f;
        if (x < -20) { x = W + 20; y = Math.random() * H; } else if (x > W + 20) { x = -20; y = Math.random() * H; }
        if (y < -20) { y = H + 20; x = Math.random() * W; } else if (y > H + 20) { y = -20; x = Math.random() * W; }
      } else {
        vx += ((tgt[a] - x) * spring + n1 * flow) * f;
        vy += ((tgt[b] - y) * spring + n2 * flow - lift * (0.4 + s)) * f;
      }
      const dx = x - px, dy = y - py, d2 = dx * dx + dy * dy;
      if (d2 < R2) {
        const d = Math.sqrt(d2) + 0.01, k = (1 - d / R);
        vx += (dx / d * k * 2.4 + ptr.vx * k * 0.06) * f; vy += (dy / d * k * 2.4 + ptr.vy * k * 0.06) * f;
      }
      vx *= damp; vy *= damp;
      pos[a] = x + vx * f; pos[b] = y + vy * f; vel[a] = vx; vel[b] = vy;
    }
    ptr.vx *= 0.8; ptr.vy *= 0.8;
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(uRes, W, H); gl.uniform1f(uSize, (mobile ? 2.3 : 2.7) * dpr); gl.uniform1f(uFade, (0.25 + 0.75 * ease) * (1 - release * 0.85));
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);
    gl.drawArrays(gl.POINTS, 0, N);
  }

  return {
    sample, frame,
    pointer(x, y) { if (ptr.x > -9000) { ptr.vx = x - ptr.x; ptr.vy = y - ptr.y; } ptr.x = x; ptr.y = y; },
    pointerOut() { ptr.x = ptr.y = -9999; },
    clear() { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); },
  };
};
