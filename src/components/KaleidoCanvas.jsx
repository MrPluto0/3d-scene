// 全屏原生 WebGL 万花筒背景（零依赖，不引 three）。
// 多镜像对称（8 折主对称 + 细分折叠）+ FBM 域扭曲 + 缓慢旋转 +
// 光谱色相流转；鼠标阻尼影响旋转速度与扭曲中心，点击触发一次
// 对称纹样绽放脉冲并衰减。页面不可见时暂停 RAF；
// prefers-reduced-motion 时只渲染一帧静止画面。
import { useEffect, useRef } from 'react';

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;

uniform vec2  uRes;
uniform float uTime;     // 累计相位（旋转受鼠标微调）
uniform vec2  uMouse;    // 阻尼后的鼠标偏移 -1..1
uniform float uPulseT;   // 距上次点击的秒数（<0 = 无脉冲）
uniform float uPulseAmp; // 脉冲幅度（已衰减）0..1

#define TAU 6.28318530718

float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = m * p;
    a *= 0.55;
  }
  return v;
}

// 万花筒折叠：极角按 n 折分段并镜像（保持严格镜像对称）
vec2 fold(vec2 p, float n, float rot) {
  float a = atan(p.y, p.x) + rot;
  float r = length(p);
  float seg = TAU / n;
  a = mod(a, seg);
  a = abs(a - seg * 0.5);
  return vec2(cos(a), sin(a)) * r;
}

// 棱镜光谱（IQ 余弦调色板）
vec3 pal(float t) {
  return 0.5 + 0.5 * cos(TAU * (vec3(0.0, 0.33, 0.67) + t));
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / min(uRes.x, uRes.y);
  vec2 ctr = uMouse * 0.15;
  vec2 p = uv - ctr;

  float t = uTime;

  // 点击脉冲：整体轻微呼吸缩放
  p *= 1.0 + uPulseAmp * 0.16;

  // 单次 8 折镜像折叠：全画面统一扇区秩序 + 缓慢旋转。
  // （不做带时间偏移的二次折叠——那会破坏镜像对称）
  vec2 fp = fold(p, 8.0, t * 0.045);
  float rr = length(p);
  float aa = atan(fp.y, fp.x);            // ∈ [0, seg/2]，随镜像自动对称
  float halfSeg = TAU / 16.0;             // 22.5°
  float petal = sin(clamp(aa / halfSeg, 0.0, 1.0) * 3.14159); // 瓣形：轴心亮、边界暗
  float petalWrap = 0.35 + 0.65 * petal;  // 花瓣包络，让扇区秩序可读

  // FBM 域扭曲
  vec2 q = fp * 1.1;
  vec2 w = vec2(
    fbm(q + vec2(1.7, 9.2) + 0.05 * t),
    fbm(q + vec2(8.3, 2.8) - 0.04 * t)
  );
  q += 1.8 * w;
  float f1 = fbm(q);
  float f2 = fbm(q * 2.4 + f1 * 1.3 + 0.12 * t);
  float f3 = fbm(q * 5.2 + f2 * 1.5 - 0.09 * t); // 内圈更细的花边倍频

  // 脊线：窄亮芯（精密细线）+ 宽辉光（玻璃质感）；外圈主、内圈细
  float ridge = 1.0 - abs(f2 * 2.0 - 1.0);
  float core = smoothstep(0.86, 0.985, ridge);
  float glow = pow(smoothstep(0.52, 0.96, ridge), 2.0);
  float ridge3 = 1.0 - abs(f3 * 2.0 - 1.0);
  float core3 = smoothstep(0.88, 0.99, ridge3);

  // 半径衰减：中心亮，边角保持可读（衰减放缓，四角纹样不熄灭）
  float falloff = 1.0 / (1.0 + rr * rr * 0.32);

  // 色相：噪声主导 + 半径/角度分光 + 跨丝宽棱镜分离 + 缓慢全局流转
  float hue = rr * 0.30 + f1 * 0.34 + (ridge - 0.8) * 0.38 + aa * 0.14 + t * 0.012;
  vec3 tint = pal(hue);
  vec3 tintWarm = pal(hue + 0.5); // 互补端点缀，避免全画面冷色

  vec3 col = vec3(0.0);
  col += tint * glow * 0.21 * falloff * petalWrap;             // 光谱辉光丝（瓣形包络）
  col += tint * glow * 0.10 * petalWrap;                       // 边角补光：四角对称秩序可读
  col += mix(tint, vec3(1.0), 0.6) * core * 0.44 * falloff * petalWrap;  // 白芯细线
  col += mix(tintWarm, vec3(1.0), 0.4) * core3 * 0.30 * falloff; // 内圈细花边（暖色端）
  // 瓣轴中脉：沿镜像轴的一根细亮线，强调扇区秩序
  col += mix(tint, vec3(1.0), 0.5) * smoothstep(0.86, 1.0, petal) * 0.16 * falloff;
  col += tintWarm * smoothstep(0.13, 0.0, rr) * 0.13;          // 中心余晖（压低，避让文字）
  // 细同心环（折叠空间内自动对称的次级结构）
  col += pal(hue + 0.08) * (0.5 + 0.5 * sin(rr * 16.0 - f1 * 6.0)) * 0.045 * falloff;

  // 点击绽放：扩散光环 + 纹样瞬时增亮后衰减
  if (uPulseAmp > 0.001) {
    float pr = uPulseT * 0.75;
    float ring = exp(-pow((length(uv - ctr) - pr) * 8.0, 2.0));
    col += pal(hue + 0.25 + pr * 0.4) * ring * uPulseAmp * 0.85;
    col += mix(tint, vec3(1.0), 0.3) * uPulseAmp * core * 0.8;
    col += tint * uPulseAmp * glow * 0.5;
  }

  // 深底色 + 暗角（放缓，保边角可读）+ 轻颗粒（暗部稍强，压 banding）
  col += vec3(0.010, 0.013, 0.026);
  float vig = 1.0 - 0.30 * dot(uv * 0.52, uv * 0.52);
  col *= clamp(vig, 0.0, 1.0);
  // 高光软滚降，避免白芯削顶
  col = col / (1.0 + col * 0.35);
  float dith = (hash(gl_FragCoord.xy + fract(t) * 61.7) - 0.5);
  col += dith * (0.014 + 0.02 * (1.0 - clamp(dot(col, vec3(0.5)), 0.0, 1.0)));

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(sh));
    return null;
  }
  return sh;
}

export default function KaleidoCanvas() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const gl = canvas.getContext('webgl', {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) return undefined;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return undefined;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(prog));
      return undefined;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uTime = gl.getUniformLocation(prog, 'uTime');
    const uMouse = gl.getUniformLocation(prog, 'uMouse');
    const uPulseT = gl.getUniformLocation(prog, 'uPulseT');
    const uPulseAmp = gl.getUniformLocation(prog, 'uPulseAmp');

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 交互状态（全部在 JS 侧阻尼/衰减，shader 只吃结果）
    const st = {
      mx: 0, my: 0,      // 阻尼后的鼠标
      tx: 0, ty: 0,      // 目标鼠标
      phase: 0,          // 累计旋转相位
      last: 0,           // 上一帧时间戳
      pulseAt: -1,       // 脉冲触发时刻（ms）
      raf: 0,
      running: false,
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    const draw = (now) => {
      resize();
      const dt = st.last ? Math.min((now - st.last) / 1000, 0.05) : 0.016;
      st.last = now;

      // 鼠标阻尼 + 相位随横向位置微调转速
      const k = 1 - Math.pow(0.0025, dt); // 帧率无关的指数阻尼
      st.mx += (st.tx - st.mx) * k;
      st.my += (st.ty - st.my) * k;
      st.phase += dt * (0.42 + st.mx * 0.16);

      let pt = -1, amp = 0;
      if (st.pulseAt >= 0) {
        pt = (now - st.pulseAt) / 1000;
        amp = pt < 3.2 ? Math.exp(-pt * 1.9) : 0;
        if (amp <= 0.001) st.pulseAt = -1;
      }

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, st.phase);
      gl.uniform2f(uMouse, st.mx, st.my);
      gl.uniform1f(uPulseT, pt);
      gl.uniform1f(uPulseAmp, amp);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const loop = (now) => {
      if (!st.running) return;
      draw(now);
      st.raf = requestAnimationFrame(loop);
    };

    const start = () => {
      if (st.running || reduced) return;
      st.running = true;
      st.last = 0;
      st.raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      st.running = false;
      cancelAnimationFrame(st.raf);
    };

    const onMove = (e) => {
      st.tx = (e.clientX / window.innerWidth) * 2 - 1;
      st.ty = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    const onDown = () => { st.pulseAt = performance.now(); };
    const onVis = () => { if (document.hidden) stop(); else start(); };
    const onResize = () => { if (reduced || !st.running) draw(performance.now()); };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('resize', onResize);

    if (reduced) {
      // 静止渲染单帧：固定相位，不做动画与脉冲
      st.mx = st.my = 0;
      draw(performance.now());
    } else {
      start();
    }

    return () => {
      stop();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', onResize);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      // 注意：不主动 loseContext —— StrictMode 会卸载重挂，同一个 canvas
      // 再 getContext 会拿到已丢失的上下文导致编译失败（300x150 黑屏）。
      // 上面 deleteProgram/deleteShader 已足够释放 GPU 资源。
    };
  }, []);

  return <canvas className="kaleido-canvas" ref={ref} aria-hidden="true" />;
}
