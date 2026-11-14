/* One cloud of points that stays on screen for the whole film and morphs between shapes.
   All motion is computed in the vertex shader, so the CPU does almost nothing per frame. */
window.AV = window.AV || {};

AV.createCloud = function (canvas, N) {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, powerPreference: 'high-performance' });
  if (!gl) return null;

  const VS = `
    attribute vec3 aA, aB, aS;
    uniform float uMix, uTime, uScale, uSize, uAspect, uChaos, uRy, uRx, uKick;
    uniform vec2 uOff, uPtr;
    varying float vAlpha, vAcc;
    mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
    void main(){
      float e = clamp((uMix - aS.x * .42) / .58, 0., 1.); e = e * e * (3. - 2. * e);
      vec3 p = mix(aA, aB, e);
      float burst = sin(e * 3.14159);
      p += vec3(sin(aS.y * 40. + aS.x * 9.), cos(aS.z * 37. + 1.3), sin(aS.x * 53. + aS.y * 11.)) * burst * uChaos;
      p.xy = rot(burst * (aS.z - .5) * 3.2) * p.xy;
      // a shockwave when the viewer presses play or jumps: every point is thrown outward, then springs back
      p += vec3(normalize(p.xy + vec2(1e-4)) * (.2 + aS.y * .8), (aS.z - .5) * 1.4) * uKick * .62;
      p += .011 * vec3(sin(uTime * 1.1 + aS.x * 60.), cos(uTime * .9 + aS.y * 60.), sin(uTime * 1.3 + aS.z * 60.));
      p.xz = rot(uRy) * p.xz; p.yz = rot(uRx) * p.yz;
      float persp = 1. / (1. - p.z * .3);
      vec2 q = p.xy * persp * uScale;
      vec2 ndc = uOff + (uAspect > 1. ? vec2(q.x / uAspect, q.y) : vec2(q.x, q.y * uAspect));
      vec2 dd = ndc - uPtr; dd.x *= uAspect; float dist = length(dd);
      float f = smoothstep(.26, 0., dist);
      ndc += normalize(dd + 1e-5) * f * .09 / vec2(uAspect, 1.);
      gl_Position = vec4(ndc, 0., 1.);
      gl_PointSize = uSize * persp * (.55 + aS.y * .95);
      vAlpha = (.5 + .5 * aS.z) * (.3 + .7 * smoothstep(-.75, .35, p.z)); vAcc = step(.88, aS.x);
    }`;
  const FS = `
    precision mediump float;
    uniform vec3 uCol, uAcc; varying float vAlpha, vAcc;
    void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, .36, d) * vAlpha;
      gl_FragColor = vec4(mix(uCol, uAcc, vAcc) * a, a); }`;

  function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  const prog = gl.createProgram();
  try { gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); } catch (e) { console.warn(e); return null; }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const U = {}; ['uMix', 'uTime', 'uScale', 'uSize', 'uAspect', 'uChaos', 'uRy', 'uRx', 'uKick', 'uOff', 'uPtr', 'uCol', 'uAcc'].forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
  const aA = gl.getAttribLocation(prog, 'aA'), aB = gl.getAttribLocation(prog, 'aB'), aS = gl.getAttribLocation(prog, 'aS');

  // deterministic random so the shapes look the same on every visit
  let seed = 20260214;
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  const seeds = new Float32Array(N * 3); for (let i = 0; i < seeds.length; i++) seeds[i] = rnd();
  const sBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, sBuf); gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(aS); gl.vertexAttribPointer(aS, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(aA); gl.enableVertexAttribArray(aB);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const shapes = {};
  function add(name, arr) { if (shapes[name]) gl.deleteBuffer(shapes[name]); const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW); shapes[name] = b; }

  /* ---- shape builders ---- */
  // Draw anything on a 2D canvas, then scatter the points over the painted pixels.
  function fromCanvas(w, h, depth, paint) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = x.strokeStyle = '#fff'; x.lineCap = x.lineJoin = 'round';
    paint(x, w, h);
    const d = x.getImageData(0, 0, w, h).data, px = [];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (d[(j * w + i) * 4 + 3] > 120) px.push(i, j);
    const out = new Float32Array(N * 3), n = px.length / 2 || 1;
    for (let i = 0; i < N; i++) {
      const k = (rnd() * n | 0) * 2;
      out[i * 3] = ((px[k] + rnd()) / h * 2 - w / h);
      out[i * 3 + 1] = 1 - (px[k + 1] + rnd()) / h * 2;
      out[i * 3 + 2] = (rnd() - .5) * depth;
    }
    return out;
  }
  const S = 420; // canvas size for icon shapes; unit square maps to [-1, 1]
  const u = (v) => (v + 1) * S / 2, uy = (v) => (1 - v) * S / 2, len = (v) => v * S / 2;
  function rr(x, x0, y0, w, h, r) { x.beginPath(); x.roundRect(u(x0), uy(y0 + h), len(w), len(h), len(r)); }
  function analytic(fn) { const out = new Float32Array(N * 3); for (let i = 0; i < N; i++) { const p = fn(i); out[i * 3] = p[0]; out[i * 3 + 1] = p[1]; out[i * 3 + 2] = p[2]; } return out; }
  function onSphere(r) { const z = rnd() * 2 - 1, a = rnd() * 6.2832, s = Math.sqrt(1 - z * z); return [Math.cos(a) * s * r, Math.sin(a) * s * r, z * r]; }

  function build(nameLines, wide) {
    // the name, set in the display face
    const W = wide ? 1500 : 760, H = wide ? 420 : 520;
    add('name', fromCanvas(W, H, .12, (x, w, h) => {
      x.textAlign = 'center'; x.textBaseline = 'middle';
      const lines = wide ? [nameLines.join(' ')] : nameLines;
      let fs = 400; x.font = `900 ${fs}px Anybody, "Arial Black", sans-serif`;
      const mw = Math.max.apply(null, lines.map((l) => x.measureText(l).width));
      fs = Math.min(fs * (w * .96) / mw, h / lines.length * .98); x.font = `900 ${fs}px Anybody, "Arial Black", sans-serif`;
      lines.forEach((l, i) => x.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * fs * .86));
    }));
    add('mono', fromCanvas(S, S, .18, (x) => {
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `900 250px Anybody, "Arial Black", sans-serif`;
      x.fillText('AV', S / 2, S / 2 + 10);
      x.beginPath(); x.arc(u(.8), uy(-.42), len(.1), 0, 6.2832); x.fill();
    }));

    add('sphere', analytic((i) => {
      // a globe drawn as latitude rings and meridians, so it reads as 3D when it turns
      const r = .9;
      if (i % 5 < 3) { const y = (Math.round((rnd() * 2 - 1) * 7) / 7) * .98, s = Math.sqrt(Math.max(0, 1 - y * y)), a = rnd() * 6.2832; return [Math.cos(a) * s * r, y * r, Math.sin(a) * s * r]; }
      const a = Math.round(rnd() * 12) / 12 * 6.2832, t = rnd() * Math.PI, s = Math.sin(t);
      return [Math.cos(a) * s * r, Math.cos(t) * r, Math.sin(a) * s * r];
    }));

    add('stairs', fromCanvas(S, S, .3, (x) => {
      for (let i = 0; i < 6; i++) { const h = .32 + i * .27; rr(x, -.92 + i * .31, -.86, .26, h, .03); x.fill(); }
    }));

    add('browser', fromCanvas(S, S, .16, (x) => {
      x.lineWidth = len(.07); rr(x, -.94, -.68, 1.88, 1.36, .12); x.stroke();
      x.fillRect(u(-.94), uy(.68), len(1.88), len(.26));
      x.globalCompositeOperation = 'destination-out';
      [-.74, -.58, -.42].forEach((cx) => { x.beginPath(); x.arc(u(cx), uy(.55), len(.05), 0, 6.2832); x.fill(); });
      x.globalCompositeOperation = 'source-over';
      // a four-point spark in the page: the assistant
      x.beginPath(); const cx = u(0), cy = uy(-.14), R = len(.36), r = len(.09);
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, q = k % 2 ? r : R; x[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * q, cy + Math.sin(a) * q); }
      x.closePath(); x.fill();
    }));

    add('wave', fromCanvas(S, S, .2, (x) => {
      const n = 30;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), env = Math.sin(t * Math.PI), h = .08 + env * (.25 + .6 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * .6)));
        rr(x, -.95 + t * 1.86, -h, .04, h * 2, .02); x.fill();
      }
    }));

    add('bubble', fromCanvas(S, S, .18, (x) => {
      rr(x, -.9, -.42, 1.8, 1.2, .3); x.fill();
      x.beginPath(); x.moveTo(u(-.5), uy(-.38)); x.lineTo(u(-.66), uy(-.86)); x.lineTo(u(-.1), uy(-.38)); x.fill();
      x.globalCompositeOperation = 'destination-out';
      [-.42, 0, .42].forEach((cx) => { x.beginPath(); x.arc(u(cx), uy(.18), len(.11), 0, 6.2832); x.fill(); });
    }));

    // a real 3D node-and-edge graph
    const nodes = []; for (let i = 0; i < 24; i++) nodes.push(onSphere(.55 + rnd() * .45));
    const edges = [];
    nodes.forEach((a, i) => {
      const near = nodes.map((b, j) => [Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), j]).sort((p, q) => p[0] - q[0]);
      edges.push([i, near[1][1]], [i, near[2][1]], [i, near[3][1]]);
    });
    add('graph', analytic((i) => {
      if (i % 5 < 2) { const c = nodes[rnd() * nodes.length | 0], o = onSphere(.075 * Math.cbrt(rnd())); return [c[0] + o[0], c[1] + o[1], c[2] + o[2]]; }
      const e = edges[rnd() * edges.length | 0], a = nodes[e[0]], b = nodes[e[1]], t = rnd(), j = .008;
      return [a[0] + (b[0] - a[0]) * t + (rnd() - .5) * j, a[1] + (b[1] - a[1]) * t + (rnd() - .5) * j, a[2] + (b[2] - a[2]) * t + (rnd() - .5) * j];
    }));

    add('ring', fromCanvas(S, S, .22, (x) => {
      x.lineWidth = len(.3); x.beginPath(); x.arc(u(0), uy(0), len(.72), -Math.PI / 2, 0); x.stroke();       // what is left
      x.lineWidth = len(.035); x.setLineDash([len(.05), len(.09)]);
      x.beginPath(); x.arc(u(0), uy(0), len(.72), 0, Math.PI * 1.5); x.stroke();                              // what went away
    }));

    add('trace', fromCanvas(S, S, .16, (x) => {
      const rows = [[0, .12], [.08, .1], [.16, .26], [.38, .44], [.78, .1], [.84, .1], [.94, .06]];
      rows.forEach((r, i) => { rr(x, -.94 + r[0] * 1.88, .72 - i * .24, Math.max(.07, r[1] * 1.88), .15, .05); x.fill(); });
    }));

    add('database', fromCanvas(S, S, .3, (x) => {
      for (let i = 0; i < 3; i++) {
        const y = .5 - i * .52;
        x.beginPath(); x.ellipse(u(0), uy(y), len(.74), len(.2), 0, 0, 6.2832); x.fill();
        x.fillRect(u(-.74), uy(y), len(1.48), len(.26));
        x.beginPath(); x.ellipse(u(0), uy(y - .26), len(.74), len(.2), 0, 0, 6.2832); x.fill();
        x.globalCompositeOperation = 'destination-out'; x.lineWidth = len(.035);
        x.beginPath(); x.ellipse(u(0), uy(y), len(.74), len(.2), 0, 0, Math.PI); x.stroke();
        x.globalCompositeOperation = 'source-over';
      }
    }));

    add('spark', fromCanvas(S, S, .2, (x) => {
      const star = (cx, cy, R) => { x.beginPath(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + Math.PI / 2, q = k % 2 ? R * .24 : R; x[k ? 'lineTo' : 'moveTo'](u(cx) + Math.cos(a) * len(q), uy(cy) - Math.sin(a) * len(q)); } x.closePath(); x.fill(); };
      star(-.12, -.08, .82); star(.66, .62, .3); star(.6, -.66, .2);
    }));

    add('cloudblocks', fromCanvas(S, S, .2, (x) => {
      [[-.38, .12, .36], [.08, .34, .46], [.52, .1, .32]].forEach((c) => { x.beginPath(); x.arc(u(c[0]), uy(c[1]), len(c[2]), 0, 6.2832); x.fill(); });
      rr(x, -.74, -.24, 1.58, .4, .18); x.fill();
      x.globalCompositeOperation = 'destination-out';
      [.2, 0].forEach((y) => { rr(x, -.4, y - .05, .8, .1, .05); x.fill(); });
      x.globalCompositeOperation = 'source-over';
      [-.5, 0, .5].forEach((cx) => { rr(x, cx - .17, -.86, .34, .3, .05); x.fill(); x.fillRect(u(cx - .02), uy(-.3), len(.04), len(.28)); });
    }));

    add('pin', fromCanvas(S, S, .22, (x) => {
      x.beginPath(); x.arc(u(0), uy(.3), len(.58), Math.PI * .86, Math.PI * .14); x.lineTo(u(0), uy(-.92)); x.closePath(); x.fill();
      x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(u(0), uy(.32), len(.23), 0, 6.2832); x.fill();
    }));

    add('people', fromCanvas(S, S, .22, (x) => {
      const person = (cx, s) => {
        x.beginPath(); x.arc(u(cx), uy(.18 * s + .12), len(.24 * s), 0, 6.2832); x.fill();
        x.beginPath(); x.ellipse(u(cx), uy(-.62), len(.42 * s), len(.52 * s), 0, Math.PI, 0); x.fill();
      };
      person(-.62, .72); person(.62, .72); person(0, 1);
    }));

    add('knot', analytic(() => {
      const t = rnd() * 6.2832, r = 2 + Math.cos(3 * t), o = onSphere(.07 * Math.sqrt(rnd()));
      return [r * Math.cos(2 * t) * .3 + o[0], r * Math.sin(2 * t) * .3 + o[1], Math.sin(3 * t) * .32 + o[2]];
    }));

    add('saturn', analytic((i) => {
      if (i % 20 < 11) return onSphere(.5);
      const a = rnd() * 6.2832, r = .74 + rnd() * .3, x = Math.cos(a) * r, z = Math.sin(a) * r, tilt = .42;
      return [x, z * Math.sin(tilt) + (rnd() - .5) * .012, z * Math.cos(tilt)];
    }));
  }

  let W = 1, H = 1, dpr = 1;
  function resize(maxDpr) {
    dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function draw(s) {
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindBuffer(gl.ARRAY_BUFFER, shapes[s.from]); gl.vertexAttribPointer(aA, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, shapes[s.to]); gl.vertexAttribPointer(aB, 3, gl.FLOAT, false, 0, 0);
    gl.uniform1f(U.uMix, s.mix); gl.uniform1f(U.uTime, s.time); gl.uniform1f(U.uScale, s.scale);
    gl.uniform1f(U.uSize, s.size * dpr); gl.uniform1f(U.uAspect, W / H); gl.uniform1f(U.uChaos, s.chaos);
    gl.uniform1f(U.uRy, s.ry); gl.uniform1f(U.uRx, s.rx); gl.uniform1f(U.uKick, s.kick || 0);
    gl.uniform2f(U.uOff, s.off[0], s.off[1]); gl.uniform2f(U.uPtr, s.ptr[0], s.ptr[1]);
    gl.uniform3f(U.uCol, s.col[0], s.col[1], s.col[2]); gl.uniform3f(U.uAcc, s.acc[0], s.acc[1], s.acc[2]);
    gl.drawArrays(gl.POINTS, 0, N);
  }

  return { build, resize, draw };
};
