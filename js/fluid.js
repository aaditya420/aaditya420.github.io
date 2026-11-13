/* Real-time 2D fluid (stable fluids: advect, vorticity, pressure projection) on the GPU.
   Low-resolution simulation, upscaled by the browser, so it stays cheap on phones. */
window.AV = window.AV || {};
AV.createFluid = function (canvas, mobile) {
  const params = { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
  let gl = canvas.getContext('webgl2', params);
  const gl2 = !!gl;
  if (!gl) gl = canvas.getContext('webgl', params);
  if (!gl) return null;

  let texType, internal, filter;
  if (gl2) {
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('EXT_color_buffer_half_float');
    texType = gl.HALF_FLOAT; internal = gl.RGBA16F; filter = gl.LINEAR;
  } else {
    const hf = gl.getExtension('OES_texture_half_float');
    if (!hf) return null;
    gl.getExtension('EXT_color_buffer_half_float');
    texType = hf.HALF_FLOAT_OES; internal = gl.RGBA;
    filter = gl.getExtension('OES_texture_half_float_linear') ? gl.LINEAR : gl.NEAREST;
  }

  const cfg = {
    sim: mobile ? 72 : 128,
    dye: mobile ? 288 : 576,
    iters: mobile ? 10 : 18,
    curl: mobile ? 14 : 22,
    velDiss: 0.4,   // per second
    dyeDiss: 0.4,
    radius: mobile ? 0.004 : 0.0028,
  };

  const VERT = `
    precision highp float;
    attribute vec2 aP; uniform vec2 texel;
    varying vec2 vUv, vL, vR, vT, vB;
    void main(){ vUv = aP * .5 + .5;
      vL = vUv - vec2(texel.x, 0.); vR = vUv + vec2(texel.x, 0.);
      vT = vUv + vec2(0., texel.y); vB = vUv - vec2(0., texel.y);
      gl_Position = vec4(aP, 0., 1.); }`;
  const HEAD = `precision highp float; precision highp sampler2D; varying vec2 vUv, vL, vR, vT, vB;`;
  const FRAG = {
    splat: `uniform sampler2D uT; uniform float aspect, radius; uniform vec3 color; uniform vec2 point;
      void main(){ vec2 p = vUv - point; p.x *= aspect;
        gl_FragColor = vec4(texture2D(uT, vUv).xyz + exp(-dot(p, p) / radius) * color, 1.); }`,
    advect: `uniform sampler2D uV, uS; uniform vec2 vTexel; uniform float dt, diss;
      void main(){ vec2 c = vUv - dt * texture2D(uV, vUv).xy * vTexel;
        gl_FragColor = vec4(texture2D(uS, c).xyz / (1. + diss * dt), 1.); }`,
    divergence: `uniform sampler2D uV;
      void main(){ float L = texture2D(uV, vL).x, R = texture2D(uV, vR).x, T = texture2D(uV, vT).y, B = texture2D(uV, vB).y;
        vec2 C = texture2D(uV, vUv).xy;
        if (vL.x < 0.) L = -C.x; if (vR.x > 1.) R = -C.x; if (vT.y > 1.) T = -C.y; if (vB.y < 0.) B = -C.y;
        gl_FragColor = vec4(.5 * (R - L + T - B), 0., 0., 1.); }`,
    curl: `uniform sampler2D uV;
      void main(){ float L = texture2D(uV, vL).y, R = texture2D(uV, vR).y, T = texture2D(uV, vT).x, B = texture2D(uV, vB).x;
        gl_FragColor = vec4(.5 * (R - L - T + B), 0., 0., 1.); }`,
    vorticity: `uniform sampler2D uV, uC; uniform float curl, dt;
      void main(){ float L = texture2D(uC, vL).x, R = texture2D(uC, vR).x, T = texture2D(uC, vT).x, B = texture2D(uC, vB).x, C = texture2D(uC, vUv).x;
        vec2 f = .5 * vec2(abs(T) - abs(B), abs(R) - abs(L)); f /= length(f) + 1e-4; f *= curl * C; f.y *= -1.;
        vec2 v = texture2D(uV, vUv).xy + f * dt;
        gl_FragColor = vec4(clamp(v, -1000., 1000.), 0., 1.); }`,
    pressure: `uniform sampler2D uP, uD;
      void main(){ float L = texture2D(uP, vL).x, R = texture2D(uP, vR).x, T = texture2D(uP, vT).x, B = texture2D(uP, vB).x;
        gl_FragColor = vec4((L + R + B + T - texture2D(uD, vUv).x) * .25, 0., 0., 1.); }`,
    gradient: `uniform sampler2D uP, uV;
      void main(){ float L = texture2D(uP, vL).x, R = texture2D(uP, vR).x, T = texture2D(uP, vT).x, B = texture2D(uP, vB).x;
        gl_FragColor = vec4(texture2D(uV, vUv).xy - vec2(R - L, T - B), 0., 1.); }`,
    fade: `uniform sampler2D uT; uniform float k;
      void main(){ gl_FragColor = k * texture2D(uT, vUv); }`,
    display: `uniform sampler2D uT; uniform float gain;
      void main(){ vec3 c = texture2D(uT, vUv).rgb * gain;
        c = 1. - exp(-c * 1.35);
        vec3 bg = mix(vec3(.024, .031, .094), vec3(.05, .07, .2), vUv.y * .6);
        vec3 o = bg + c * (1. - bg * .5);
        vec2 q = vUv - .5; o *= 1. - dot(q, q) * .55;
        float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        gl_FragColor = vec4(o + (n - .5) * .018, 1.); }`,
  };

  function shader(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const vs = shader(gl.VERTEX_SHADER, VERT);
  const prog = {};
  try {
    for (const k in FRAG) {
      const p = gl.createProgram();
      gl.attachShader(p, vs); gl.attachShader(p, shader(gl.FRAGMENT_SHADER, HEAD + FRAG[k]));
      gl.bindAttribLocation(p, 0, 'aP'); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
      prog[k] = { p, u };
    }
  } catch (e) { console.warn('fluid: shader failed', e); return null; }

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.disable(gl.BLEND);

  function fbo(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, texType, null);
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, f, w, h, ok };
  }
  function pair(w, h) {
    let a = fbo(w, h), b = fbo(w, h);
    return { get read() { return a; }, get write() { return b; }, swap() { const t = a; a = b; b = t; }, w, h, ok: a.ok && b.ok };
  }
  function dims(res) {
    const ar = canvas.width / Math.max(1, canvas.height);
    return ar >= 1 ? [Math.round(res * ar), res] : [res, Math.round(res / ar)];
  }

  let vel, dye, prs, div, crl;
  function build() {
    const [sw, sh] = dims(cfg.sim), [dw, dh] = dims(cfg.dye);
    vel = pair(sw, sh); prs = pair(sw, sh); div = fbo(sw, sh); crl = fbo(sw, sh); dye = pair(dw, dh);
    return vel.ok && dye.ok;
  }
  function resize() {
    const s = mobile ? 0.5 : 0.6;
    const w = Math.max(2, Math.round(canvas.clientWidth * s)), h = Math.max(2, Math.round(canvas.clientHeight * s));
    if (canvas.width === w && canvas.height === h) return true;
    // ignore small height changes (mobile URL bar) so the dye is not wiped while scrolling
    if (vel && canvas.width === w && Math.abs(canvas.height - h) < canvas.height * 0.2) return true;
    canvas.width = w; canvas.height = h;
    return build();
  }
  if (!resize()) return null;

  let tunit;
  function use(k) { gl.useProgram(prog[k].p); tunit = 0; return prog[k].u; }
  function tex(loc, t) { gl.activeTexture(gl.TEXTURE0 + tunit); gl.bindTexture(gl.TEXTURE_2D, t.tex); gl.uniform1i(loc, tunit++); }
  function draw(target, u) {
    if (target) { gl.bindFramebuffer(gl.FRAMEBUFFER, target.f); gl.viewport(0, 0, target.w, target.h); if (u.texel) gl.uniform2f(u.texel, 1 / target.w, 1 / target.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); if (u.texel) gl.uniform2f(u.texel, 1 / canvas.width, 1 / canvas.height); }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function splat(x, y, dx, dy, color, scale) {
    const u = use('splat');
    const aspect = canvas.width / canvas.height;
    gl.uniform1f(u.aspect, aspect); gl.uniform2f(u.point, x, y);
    gl.uniform1f(u.radius, cfg.radius * (scale || 1) * (aspect > 1 ? aspect : 1));
    tex(u.uT, vel.read); gl.uniform3f(u.color, dx, dy, 0); draw(vel.write, u); vel.swap();
    if (color) { tunit = 0; tex(u.uT, dye.read); gl.uniform3f(u.color, color[0], color[1], color[2]); draw(dye.write, u); dye.swap(); }
  }

  function step(dt) {
    let u = use('curl'); tex(u.uV, vel.read); draw(crl, u);
    u = use('vorticity'); tex(u.uV, vel.read); tex(u.uC, crl); gl.uniform1f(u.curl, cfg.curl); gl.uniform1f(u.dt, dt); draw(vel.write, u); vel.swap();
    u = use('divergence'); tex(u.uV, vel.read); draw(div, u);
    u = use('fade'); tex(u.uT, prs.read); gl.uniform1f(u.k, 0.8); draw(prs.write, u); prs.swap();
    u = use('pressure');
    for (let i = 0; i < cfg.iters; i++) { tunit = 0; tex(u.uP, prs.read); tex(u.uD, div); draw(prs.write, u); prs.swap(); }
    u = use('gradient'); tex(u.uP, prs.read); tex(u.uV, vel.read); draw(vel.write, u); vel.swap();
    u = use('advect'); gl.uniform2f(u.vTexel, 1 / vel.w, 1 / vel.h); gl.uniform1f(u.dt, dt);
    tex(u.uV, vel.read); tex(u.uS, vel.read); gl.uniform1f(u.diss, cfg.velDiss); draw(vel.write, u); vel.swap();
    tunit = 0; tex(u.uV, vel.read); tex(u.uS, dye.read); gl.uniform1f(u.diss, cfg.dyeDiss); draw(dye.write, u); dye.swap();
  }

  let gain = 1, slow = 0, degraded = false;
  return {
    splat, resize,
    setGain(g) { gain = g; },
    frame(dt, ms) {
      step(Math.min(dt, 0.0167));
      const u = use('display'); tex(u.uT, dye.read); gl.uniform1f(u.gain, gain); draw(null, u);
      // one-way quality drop if the device cannot keep up
      if (!degraded && ms > 26) { if (++slow > 80) { degraded = true; cfg.iters = Math.max(6, cfg.iters >> 1); cfg.dye = Math.round(cfg.dye * 0.6); cfg.sim = Math.round(cfg.sim * 0.75); build(); } }
      else if (slow > 0) slow--;
    },
    get degraded() { return degraded; },
  };
};
