/*
 * Galaxy adapted from @react-bits/Galaxy-JS-CSS.
 * Source: https://reactbits.dev/r/Galaxy-JS-CSS.json
 * Copyright (c) 2026 David Haz. See ../licenses/react-bits-LICENSE.md.
 * Uses native WebGL 2, the GunplaHub palette, and the shared background lifecycle.
 */
(() => {
  "use strict";

const vertex = `#version 300 es
in vec2 position;

out vec2 vUv;

void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0, 1);
}
`;

const fragment = `#version 300 es
precision highp float;

uniform float uTime;
uniform vec3 uResolution;
uniform vec2 uFocal;
uniform vec2 uRotation;
uniform float uStarSpeed;
uniform float uDensity;
uniform float uHueShift;
uniform float uSpeed;
uniform vec2 uMouse;
uniform float uGlowIntensity;
uniform float uSaturation;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform bool uMouseRepulsion;
uniform float uTwinkleIntensity;
uniform float uRotationSpeed;
uniform float uRepulsionStrength;
uniform float uMouseActiveFactor;
uniform float uAutoCenterRepulsion;
uniform bool uTransparent;
uniform float uLightMode;

in vec2 vUv;
out vec4 fragColor;

#define NUM_LAYER 4.0
#define STAR_COLOR_CUTOFF 0.2
#define MAT45 mat2(0.7071, -0.7071, 0.7071, 0.7071)
#define PERIOD 3.0

float Hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float tri(float x) {
  return abs(fract(x) * 2.0 - 1.0);
}

float tris(float x) {
  float t = fract(x);
  return 1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0));
}

float trisn(float x) {
  float t = fract(x);
  return 2.0 * (1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0))) - 1.0;
}


float Star(vec2 uv, float flare) {
  float d = length(uv);
  float m = (0.05 * uGlowIntensity) / max(d, 0.0001);
  float rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * flare * uGlowIntensity;
  uv *= MAT45;
  rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * 0.3 * flare * uGlowIntensity;
  m *= (1.0 - smoothstep(0.2, 1.0, d));
  return m;
}

vec3 StarLayer(vec2 uv) {
  vec3 col = vec3(0.0);

  vec2 gv = fract(uv) - 0.5; 
  vec2 id = floor(uv);

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 si = id + vec2(float(x), float(y));
      float seed = Hash21(si);
      float size = fract(seed * 345.32);
      float glossLocal = tri(uStarSpeed / (PERIOD * seed + 1.0));
      float flareSize = smoothstep(0.9, 1.0, size) * glossLocal;

      float red = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 1.0)) + STAR_COLOR_CUTOFF;
      float blu = smoothstep(STAR_COLOR_CUTOFF, 1.0, Hash21(si + 3.0)) + STAR_COLOR_CUTOFF;
      float grn = min(red, blu) * seed;
      vec3 base = vec3(red, grn, blu);
      
      float hue = atan(base.g - base.r, base.b - base.r) / (2.0 * 3.14159) + 0.5;
      hue = fract(hue + uHueShift / 360.0);
      float val = max(max(base.r, base.g), base.b);
      // Preserve Galaxy star variation within the project's accent palette.
      vec3 themeColor = hue < 0.5
        ? mix(uColor1, uColor2, hue * 2.0)
        : mix(uColor2, uColor3, (hue - 0.5) * 2.0);
      base = mix(vec3(val), themeColor * val, clamp(uSaturation, 0.0, 1.0));

      vec2 pad = vec2(tris(seed * 34.0 + uTime * uSpeed / 10.0), tris(seed * 38.0 + uTime * uSpeed / 30.0)) - 0.5;

      float star = Star(gv - offset - pad, flareSize);
      vec3 color = base;

      float twinkle = trisn(uTime * uSpeed + seed * 6.2831) * 0.5 + 1.0;
      twinkle = mix(1.0, twinkle, uTwinkleIntensity);
      star *= twinkle;
      
      col += star * size * color;
    }
  }

  return col;
}

void main() {
  vec2 focalPx = uFocal * uResolution.xy;
  vec2 uv = (vUv * uResolution.xy - focalPx) / uResolution.y;

  vec2 mouseNorm = uMouse - vec2(0.5);
  
  if (uAutoCenterRepulsion > 0.0) {
    vec2 centerUV = vec2(0.0, 0.0);
    float centerDist = length(uv - centerUV);
    vec2 repulsion = (uv - centerUV) / max(centerDist, 0.0001) * (uAutoCenterRepulsion / (centerDist + 0.1));
    uv += repulsion * 0.05;
  } else if (uMouseRepulsion) {
    vec2 mousePosUV = (uMouse * uResolution.xy - focalPx) / uResolution.y;
    float mouseDist = length(uv - mousePosUV);
    vec2 repulsion = (uv - mousePosUV) / max(mouseDist, 0.0001) * (uRepulsionStrength / (mouseDist + 0.1));
    uv += repulsion * 0.05 * uMouseActiveFactor;
  } else {
    vec2 mouseOffset = mouseNorm * 0.1 * uMouseActiveFactor;
    uv += mouseOffset;
  }

  float autoRotAngle = uTime * uRotationSpeed;
  mat2 autoRot = mat2(cos(autoRotAngle), -sin(autoRotAngle), sin(autoRotAngle), cos(autoRotAngle));
  uv = autoRot * uv;

  uv = mat2(uRotation.x, -uRotation.y, uRotation.y, uRotation.x) * uv;

  vec3 col = vec3(0.0);

  for (float i = 0.0; i < 1.0; i += 1.0 / NUM_LAYER) {
    float depth = fract(i + uStarSpeed * uSpeed);
    float scale = mix(20.0 * uDensity, 0.5 * uDensity, depth);
    float fade = depth * (1.0 - smoothstep(0.9, 1.0, depth));
    col += StarLayer(uv * scale + i * 453.32) * fade;
  }

  if (uLightMode > 0.5) {
    float energy = max(max(col.r, col.g), col.b);
    float coverage = clamp(smoothstep(0.0, 0.42, energy) * 0.92, 0.0, 0.92);
    vec3 ink = clamp(col * 0.48, 0.0, 0.82);
    fragColor = vec4(mix(vec3(1.0), ink, coverage), 1.0);
  } else if (uTransparent) {
    float alpha = length(col);
    alpha = smoothstep(0.0, 0.3, alpha);
    alpha = min(alpha, 1.0);
    fragColor = vec4(col, alpha);
  } else {
    fragColor = vec4(col, 1.0);
  }
}
`;

  const container = document.querySelector(".ambient-bg");
  if (!container) return;

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "low-power"
  });
  if (!gl) return; // Keep the CSS background when WebGL is unavailable.

  const theme = getComputedStyle(document.documentElement);
  const color = (token, fallback) => {
    const hex = theme.getPropertyValue(token).trim() || fallback;
    const rgb = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return rgb ? rgb.slice(1).map(channel => parseInt(channel, 16) / 255) : [1, 1, 1];
  };

  // Match GunplaHub's existing red/orange accents and gold highlights.
  const settings = {
    uSpeed: 0.45,
    uDensity: 1,
    uHueShift: 0,
    uGlowIntensity: 0.4,
    uSaturation: 0.8,
    uTwinkleIntensity: 0.2,
    uRotationSpeed: 0.035,
    uRepulsionStrength: 0.6,
    uAutoCenterRepulsion: 0,
    uLightMode: 0
  };
  const starSpeed = 0.35;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const motionKey = "gunpla.backgroundMotion.v1";
  let motionPaused = false;
  try {
    motionPaused = localStorage.getItem(motionKey) === "paused";
  } catch { /* Animation controls still work when browser storage is unavailable. */ }
  const motionButton = document.createElement("button");
  motionButton.type = "button";
  motionButton.className = "background-motion-toggle";
  const currentMouse = [0.5, 0.5];
  const targetMouse = [0.5, 0.5];
  let currentActive = 0;
  let targetActive = 0;
  let program;
  let buffer;
  let uniforms = {};
  let frame = 0;
  let lastFrame = 0;
  let animationTime = 0;
  let contextLost = false;
  let pagePaused = false;
  let disposed = false;

  function compile(type, source) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Unable to create Galaxy shader.");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(message || "Unable to compile Galaxy shader.");
    }
    return shader;
  }

  function releaseResources() {
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    buffer = null;
    program = null;
  }

  function createResources() {
    const shaders = [];
    try {
      shaders.push(compile(gl.VERTEX_SHADER, vertex));
      shaders.push(compile(gl.FRAGMENT_SHADER, fragment));
      program = gl.createProgram();
      if (!program) throw new Error("Unable to create Galaxy program.");
      shaders.forEach(shader => gl.attachShader(program, shader));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || "Unable to link Galaxy program.");
      }
    } finally {
      shaders.forEach(shader => gl.deleteShader(shader));
    }

    gl.useProgram(program);
    buffer = gl.createBuffer();
    if (!buffer) throw new Error("Unable to create Galaxy geometry.");
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const names = [...Object.keys(settings), "uResolution", "uTime", "uStarSpeed", "uColor1", "uColor2", "uColor3", "uFocal", "uRotation", "uMouse", "uMouseRepulsion", "uMouseActiveFactor", "uTransparent"];
    uniforms = Object.fromEntries(names.map(name => [name, gl.getUniformLocation(program, name)]));
    Object.entries(settings).forEach(([name, value]) => gl.uniform1f(uniforms[name], value));
    gl.uniform3fv(uniforms.uColor1, color("--red", "#ff2638"));
    gl.uniform3fv(uniforms.uColor2, color("--orange", "#ff7a18"));
    gl.uniform3fv(uniforms.uColor3, color("--yellow", "#ffe26a"));
    gl.uniform2f(uniforms.uFocal, 0.5, 0.5);
    gl.uniform2f(uniforms.uRotation, 1, 0);
    gl.uniform1i(uniforms.uTransparent, 1);
    gl.clearColor(0, 0, 0, 0);
    gl.disable(gl.DEPTH_TEST);
  }

  function draw() {
    if (disposed || contextLost || !program) return;
    gl.uniform1f(uniforms.uTime, animationTime);
    gl.uniform1f(uniforms.uStarSpeed, animationTime * starSpeed / 10);
    gl.uniform2fv(uniforms.uMouse, currentMouse);
    gl.uniform1f(uniforms.uMouseActiveFactor, reducedMotion.matches || motionPaused ? 0 : currentActive);
    gl.uniform1i(uniforms.uMouseRepulsion, reducedMotion.matches || motionPaused ? 0 : 1);
    gl.uniform1f(uniforms.uTwinkleIntensity, reducedMotion.matches ? 0 : settings.uTwinkleIntensity);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function resize() {
    if (disposed || contextLost) return;
    const { width, height } = container.getBoundingClientRect();
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    // Bound the pixel budget on high-resolution displays and mobile devices.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(1800000 / (w * h)));
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform3f(uniforms.uResolution, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.drawingBufferWidth / gl.drawingBufferHeight);
    draw();
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  function loop(now) {
    frame = 0;
    if (disposed || contextLost || pagePaused || document.hidden || motionPaused) return;
    const delta = Math.min((now - lastFrame) / 1000, 0.1);
    // Reduced motion keeps a slow drift, without twinkling or cursor repulsion.
    animationTime += delta * (reducedMotion.matches ? 0.5 : 1);
    lastFrame = now;
    const smoothing = 1 - Math.exp(-3 * delta);
    currentMouse[0] += smoothing * (targetMouse[0] - currentMouse[0]);
    currentMouse[1] += smoothing * (targetMouse[1] - currentMouse[1]);
    currentActive += smoothing * (targetActive - currentActive);
    draw();
    frame = requestAnimationFrame(loop);
  }

  function syncPlayback() {
    stop();
    if (disposed || contextLost || pagePaused || document.hidden) return;
    draw();
    if (!motionPaused) {
      lastFrame = performance.now();
      frame = requestAnimationFrame(loop);
    }
  }

  function onPointerMove(event) {
    if (reducedMotion.matches || motionPaused || event.pointerType !== "mouse") return;
    const rect = container.getBoundingClientRect();
    targetMouse[0] = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    targetMouse[1] = Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height));
    targetActive = 1;
  }

  function onPointerLeave() {
    targetActive = 0;
  }

  function updateMotionButton() {
    motionButton.textContent = motionPaused ? "Play background" : "Pause background";
    motionButton.setAttribute("aria-label", motionPaused ? "Play Galaxy background animation" : "Pause Galaxy background animation");
  }

  function toggleMotion() {
    motionPaused = !motionPaused;
    try {
      localStorage.setItem(motionKey, motionPaused ? "paused" : "playing");
    } catch { /* The current page still honors the selected setting. */ }
    updateMotionButton();
    syncPlayback();
  }

  function onContextLost(event) {
    event.preventDefault();
    contextLost = true;
    stop();
    container.classList.remove("galaxy-ready");
    motionButton.hidden = true;
  }

  function onContextRestored() {
    contextLost = false;
    try {
      createResources();
      resize();
      container.classList.add("galaxy-ready");
      motionButton.hidden = false;
      syncPlayback();
    } catch (error) {
      console.warn("Galaxy is using its static background.", error);
      dispose();
    }
  }

  function onPageHide(event) {
    pagePaused = true;
    stop();
    if (!event.persisted) dispose();
  }

  function onPageShow() {
    pagePaused = false;
    resize();
    syncPlayback();
  }

  function dispose() {
    disposed = true;
    stop();
    observer.disconnect();
    window.removeEventListener("resize", resize);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("blur", onPointerLeave);
    document.documentElement.removeEventListener("pointerleave", onPointerLeave);
    document.removeEventListener("visibilitychange", syncPlayback);
    reducedMotion.removeEventListener("change", syncPlayback);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
    canvas.removeEventListener("webglcontextlost", onContextLost);
    canvas.removeEventListener("webglcontextrestored", onContextRestored);
    releaseResources();
    canvas.remove();
    motionButton.removeEventListener("click", toggleMotion);
    motionButton.remove();
    container.classList.remove("galaxy-ready");
  }

  try {
    createResources();
  } catch (error) {
    releaseResources();
    console.warn("Galaxy is using its static background.", error);
    return;
  }

  container.appendChild(canvas);
  container.classList.add("galaxy-ready");
  updateMotionButton();
  motionButton.addEventListener("click", toggleMotion);
  document.body.appendChild(motionButton);
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  window.addEventListener("resize", resize, { passive: true });
  // Listen on the window so the decorative canvas never intercepts links or scrolling.
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("blur", onPointerLeave);
  document.documentElement.addEventListener("pointerleave", onPointerLeave);
  document.addEventListener("visibilitychange", syncPlayback);
  reducedMotion.addEventListener("change", syncPlayback);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);
  resize();
  syncPlayback();
})();
