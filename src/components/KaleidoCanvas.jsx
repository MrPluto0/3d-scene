// 全屏原生 WebGL 万花筒（零依赖，不引 three）。单 canvas 单着色器。
// 结构：
//   ① 背景世界层：以 b8b0e56 版（8 折 fold + FBM 域扭曲 + 暗色变幻色盘）
//      为基准恢复；其余三套世界只是它的克制变体——仅改折数（6/10/12）、
//      色相基、扭曲量与流速档位，色盘亮度/饱和保持同一暗色家族。
//      点击空白循环换世界：uMorphA/uMorphB 双形态交叉渐变（约 1s）+ 一次
//      轻微角加速「甩尾」作过场（不做旧版的点击绽放脉冲）。
//      鼠标阻尼跟随保留：整体漂移 + 转速微调。
//   ② 场景嵌窗层：三场景入口是嵌在【折叠后的楔形空间】里的暗色琉璃窗——
//      每个镜像楔形沿其中线（镜像轴）在三个半径上各放一扇径向梯形窗
//      （内环/中环/外环 = 雪夜馄饨摊/馄饨摊·重制/天空之城），随 fold
//      自动 N 折镜像重复、随万花筒整体旋转，与背景同一秩序。窗为暗色
//      半透琉璃（底色压暗），边缘一条场景专属色细亮缘（低亮度低饱和），
//      窗内标签压暗底 + 微光文字（离屏 canvas 中文图集）。
//      悬停：该场景整环（所有楔形内同半径的窗）轻微提亮 + 光标 pointer；
//      点击窗直达场景路由；点击空白换世界。
// 命中检测与着色器同一几何：屏幕坐标 → uv → 极坐标 → fold 变换 →
//      楔形内局部坐标 → 窗 SDF 判定（touch 同语义，pointer 事件统一）。
// 页面不可见暂停 RAF；prefers-reduced-motion 时只渲染静止帧。
import { useEffect, useRef } from 'react';

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;

uniform vec2  uRes;
uniform float uTime;     // 动画时钟（窗缘呼吸 / 标签微光）
uniform vec2  uMouse;    // 阻尼后的鼠标偏移 -1..1
uniform float uSpin;     // 折叠旋转相位（含换世界甩尾）
uniform float uFlowT;    // 域扭曲流动相位（按世界流速累计，基准与旧版一致）
uniform float uHueT;     // 色相流转相位（速率与旧版 0.42 相位时钟一致）
uniform float uMorphK;   // 双形态混合系数（JS 侧已缓动）
uniform vec4  uMorphA;   // 形态A：折数 / 色相基 / 扭曲量 / 保留
uniform vec4  uMorphB;   // 形态B
uniform vec2  uCtr;      // 万花筒中心（uv，随布局定位）
uniform vec3  uRing;     // 三环半径 R0/R1/R2（uv，沿镜像轴）
uniform float uWinA;     // 窗径向半厚 a（uv）
uniform vec3  uWinB;     // 三环切向半宽 b0/b1/b2（uv，随折数自适应）
uniform vec3  uHover;    // 三环（场景）悬停权重（JS 阻尼）
uniform vec3  uAcc0;     // 场景专属色（压暗后的点缀色：缘/内染/文字微光）
uniform vec3  uAcc1;
uniform vec3  uAcc2;
uniform vec4  uCardA;    // 遮挡区矩形A（标题卡，uv 坐标 y 向上；窗在其附近淡出）
uniform vec4  uCardB;    // 遮挡区矩形B（底部提示条；无则放在远处）
uniform sampler2D uAtlas; // 中文标签图集（3 格）

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

// 万花筒折叠：极角按 n 折分段并镜像（保持严格镜像对称；n 过场中可为小数）
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

// ---- 背景世界纹样：b8b0e56 版原样（仅折数/色相基/扭曲量参数化） ----
// fp 为已折叠坐标（与嵌窗层共享同一次 fold），p 为折叠前坐标。
vec3 pattern(vec2 p, vec2 fp, float n, float hue0, float warpAmt) {
  float rr = length(p);
  float halfSeg = TAU / (2.0 * n);
  float aa = atan(fp.y, fp.x);                     // ∈ [0, halfSeg]，随镜像自动对称
  float petal = sin(clamp(aa / halfSeg, 0.0, 1.0) * 3.14159); // 瓣形包络
  float petalWrap = 0.35 + 0.65 * petal;

  // FBM 域扭曲（扭曲量 = 世界性格档位）
  vec2 q = fp * 1.1;
  vec2 w = vec2(
    fbm(q + vec2(1.7, 9.2) + 0.05 * uFlowT),
    fbm(q + vec2(8.3, 2.8) - 0.04 * uFlowT)
  );
  q += warpAmt * w;
  float f1 = fbm(q);
  float f2 = fbm(q * 2.4 + f1 * 1.3 + 0.12 * uFlowT);
  float f3 = fbm(q * 5.2 + f2 * 1.5 - 0.09 * uFlowT);

  // 脊线：窄亮芯（精密细线）+ 宽辉光（玻璃质感）
  float ridge = 1.0 - abs(f2 * 2.0 - 1.0);
  float core = smoothstep(0.86, 0.985, ridge);
  float glow = pow(smoothstep(0.52, 0.96, ridge), 2.0);
  float ridge3 = 1.0 - abs(f3 * 2.0 - 1.0);
  float core3 = smoothstep(0.88, 0.99, ridge3);

  float falloff = 1.0 / (1.0 + rr * rr * 0.32);

  float hue = rr * 0.30 + f1 * 0.34 + (ridge - 0.8) * 0.38
            + aa * 0.14 + hue0 + uHueT * 0.012;
  vec3 tint = pal(hue);
  vec3 tintWarm = pal(hue + 0.5);

  vec3 col = vec3(0.0);
  col += tint * glow * 0.21 * falloff * petalWrap;
  col += tint * glow * 0.10 * petalWrap;
  col += mix(tint, vec3(1.0), 0.6) * core * 0.44 * falloff * petalWrap;
  col += mix(tintWarm, vec3(1.0), 0.4) * core3 * 0.30 * falloff;
  col += mix(tint, vec3(1.0), 0.5) * smoothstep(0.86, 1.0, petal) * 0.16 * falloff;
  col += tintWarm * smoothstep(0.13, 0.0, rr) * 0.13;
  col += pal(hue + 0.08) * (0.5 + 0.5 * sin(rr * 16.0 - f1 * 6.0)) * 0.045 * falloff;
  return col;
}

// ---- 嵌窗 SDF：圆角径向梯形（长边沿径向，外缘略宽） ----
// q 为窗局部坐标（+x 径向向外，原点在窗心）。
float sdfWin(vec2 q, float aW, float bW) {
  float wL = bW * (1.0 + 0.16 * clamp(q.x / aW, -1.0, 1.0)); // 外缘渐宽的梯形
  float rad = 0.40 * min(aW, wL);                            // 圆角半径
  vec2 dq = vec2(abs(q.x) - aW + rad, abs(q.y) - wL + rad);
  return length(max(dq, vec2(0.0))) + min(max(dq.x, dq.y), 0.0) - rad;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / min(uRes.x, uRes.y);
  vec2 ctr = uCtr + uMouse * 0.15;
  vec2 p = uv - ctr;
  float px = 2.0 / min(uRes.x, uRes.y);  // 1 像素的 uv 宽度

  // ---- 世界层：双形态混合，单次 fold 共享给纹样与嵌窗 ----
  vec4 M = mix(uMorphA, uMorphB, uMorphK);
  float n = M.x;
  vec2 fp = fold(p, n, uSpin);
  vec3 col = pattern(p, fp, n, M.y, M.z);
  float vig = 1.0 - 0.30 * dot(uv * 0.52, uv * 0.52);
  col *= clamp(vig, 0.0, 1.0);

  // ---- 嵌窗层：折叠空间内，沿镜像轴（折叠角 0）三环布窗 ----
  // 扇区几何：镜像轴的屏幕角 thM（标签框按它对齐屏幕，文字永远正立）
  float aO = atan(p.y, p.x) + uSpin;
  float seg = TAU / n;
  float kf = floor(aO / seg);
  float thM = (kf + 0.5) * seg - uSpin;

  float d0 = sdfWin(fp - vec2(uRing.x, 0.0), uWinA, uWinB.x);
  float d1 = sdfWin(fp - vec2(uRing.y, 0.0), uWinA, uWinB.y);
  float d2 = sdfWin(fp - vec2(uRing.z, 0.0), uWinA, uWinB.z);
  float dW = min(min(d0, d1), d2);
  float kk = d0 < d1 ? (d0 < d2 ? 0.0 : 2.0) : (d1 < d2 ? 1.0 : 2.0);

  float Rk  = kk < 0.5 ? uRing.x  : (kk < 1.5 ? uRing.y  : uRing.z);
  float bW  = kk < 0.5 ? uWinB.x  : (kk < 1.5 ? uWinB.y  : uWinB.z);
  vec3 acc  = kk < 0.5 ? uAcc0    : (kk < 1.5 ? uAcc1    : uAcc2);
  float hov = kk < 0.5 ? uHover.x : (kk < 1.5 ? uHover.y : uHover.z);

  // 遮挡区淡出：窗接近标题卡/底部提示条时整体渐隐（避免「压在卡片下」的割裂感）
  vec2 dA = max(uCardA.xy - uv, uv - uCardA.zw);
  vec2 dB = max(uCardB.xy - uv, uv - uCardB.zw);
  float kCard = smoothstep(0.0, 0.13, min(length(dA), length(dB)));

  // 座影：把窗「压」进底纹（外侧轻微压暗，窗沿贴合背景）
  col *= 1.0 - 0.15 * kCard * exp(-max(dW, 0.0) / (uWinA * 1.2));

  // 标签框：窗心的屏幕对齐盒（尺寸按窗在屏幕上的朝向自适应，字不变形）。
  // 盒太矮时只显名字带（小窗不塞小注，保证名字可读）。
  vec2 C = ctr + Rk * vec2(cos(thM), sin(thM));
  vec2 ls = uv - C;
  float aL = uWinA * 0.90, bL = bW * 0.90;
  float cs = cos(thM), sn = sin(thM);
  float hx = 0.78 * sqrt(aL * aL * cs * cs + bL * bL * sn * sn);
  float hy = 0.78 * sqrt(aL * aL * sn * sn + bL * bL * cs * cs);
  float ASPF = 560.0 / 232.0;                  // 全标签（名 + 小注）采样区
  float ASPN = 560.0 / 96.0;                   // 仅名字带
  float bhF = min(hy, hx / ASPF);
  float nameOnly = step(bhF, 0.040);
  float bh = mix(bhF, min(hy, hx / ASPN), nameOnly);
  float bw = bh * mix(ASPF, ASPN, nameOnly);
  vec2 tq = ls / vec2(bw, bh);                  // 标签盒局部坐标 -1..1
  float inBox = step(abs(tq.x), 1.0) * step(abs(tq.y), 1.0);

  // 图集采样（无条件采样避免分支梯度问题，盒外用 mask 屏蔽）
  float cellW = 2048.0 / 3.0;
  float wReg = 560.0;
  float x0 = kk * cellW + (cellW - wReg) * 0.5;
  float v0 = mix(12.0 / 256.0, 134.0 / 256.0, nameOnly);
  float v1 = mix(244.0 / 256.0, 230.0 / 256.0, nameOnly);
  vec2 auv = vec2((x0 + (clamp(tq.x, -1.0, 1.0) * 0.5 + 0.5) * wReg) / 2048.0,
                  mix(v0, v1, clamp(tq.y, -1.0, 1.0) * 0.5 + 0.5));
  float tA = texture2D(uAtlas, auv).a * inBox;

  // 窗体：暗色琉璃（底纹透一半进来 + 极淡场景色内染 + 内缘微光）
  float cov = smoothstep(1.25 * px, -1.25 * px, dW) * kCard;
  if (cov > 0.003) {
    // 先补回暗角再整体压暗（比背景暗，融进底色但不发死黑）
    vec3 glass = col / max(clamp(vig, 0.0, 1.0), 0.25) * 0.58;
    glass += acc * 0.040 * (1.0 + hov * 1.1);                  // 场景色内染（克制）
    float innerRim = exp(-pow((dW + uWinA * 0.34) / (uWinA * 0.15), 2.0));
    glass += acc * innerRim * (0.07 + 0.14 * hov);             // 内缘一圈微光
    // 标签压暗底（椭圆），保证文字对比
    float back = exp(-dot(tq, tq) * 1.35) * inBox;
    glass *= 1.0 - 0.66 * back;
    // 文字：平时微白偏场景色，悬停转亮增强微光
    vec3 labelCol = mix(acc * 0.42 + vec3(0.52), vec3(1.0), 0.38 * hov);
    glass = mix(glass, labelCol * (0.68 + 0.28 * hov), tA * 0.95);
    glass += acc * tA * (0.05 + 0.10 * hov) * (0.7 + 0.3 * sin(uTime * 0.9 + kk * 2.1));
    col = mix(col, glass, cov);
    // 细亮缘：场景专属色、低亮度低饱和（悬停时缘变清晰）
    float rim = exp(-pow(dW / (1.6 * px), 2.0)) * kCard;
    vec3 rimCol = acc * (0.30 + 0.30 * hov) + vec3(1.0) * 0.05 * hov;
    col += rimCol * rim;
    // 窗沿呼吸微光（极轻，让整环「活」）
    col += acc * 0.035 * (0.5 + 0.5 * sin(uTime * 0.8 + kk * 2.1 + Rk * 17.0))
           * exp(-abs(dW) / (uWinA * 1.6)) * (0.8 + 0.5 * hov) * kCard;
  }

  // 深底色 + 软滚降 + 颗粒抖动（压 banding）
  col += vec3(0.010, 0.013, 0.026);
  col = col / (1.0 + col * 0.35);
  float dith = (hash(gl_FragCoord.xy + fract(uTime) * 61.7) - 0.5);
  col += dith * (0.014 + 0.02 * (1.0 - clamp(dot(col, vec3(0.5)), 0.0, 1.0)));

  gl_FragColor = vec4(col, 1.0);
}
`;

// 三场景：路由 / 标签文案 / 专属点缀色（已压暗压灰，仅用于细缘与微光）
const SCENES = [
  {
    path: '/wonton-mini', name: '雪夜馄饨摊', tag: '手写 shader·实时三渲二',
    acc: [0.30, 0.44, 0.58], // 冰蓝（压暗）
  },
  {
    path: '/stall', name: '馄饨摊·重制', tag: 'Blender GLB·图集与实时',
    acc: [0.58, 0.40, 0.20], // 琥珀（压暗）
  },
  {
    path: '/sky-city', name: '天空之城', tag: '王城·云海浮空',
    acc: [0.46, 0.34, 0.56], // 玫瑰紫（压暗）
  },
];

// 四套世界：基准为 b8b0e56 的 8 折流光；其余为克制变体——
// 只改折数 / 色相基 / 扭曲量 / 流速 / 自转（同一暗色色盘家族）
const WORLDS = [
  { n: 8,  hue: 0.00, warp: 1.80, flow: 1.00, spin: 0.019 },  // 流光（基准）
  { n: 6,  hue: 0.55, warp: 1.35, flow: 1.65, spin: -0.032 }, // 深潭
  { n: 10, hue: 0.80, warp: 2.30, flow: 0.60, spin: 0.014 },  // 棱纹
  { n: 12, hue: 0.34, warp: 1.10, flow: 1.30, spin: -0.024 }, // 密华
];

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

// 离屏 canvas 生成中文标签图集：2048×256（双 POT，可 mipmap），3 格。
// 每格中央 560×232 区域为采样区（与 shader 内 ASP 常数一致），上名字下小注。
function makeAtlas() {
  const cv = document.createElement('canvas');
  cv.width = 2048;
  cv.height = 256;
  const g = cv.getContext('2d');
  if ('letterSpacing' in g) g.letterSpacing = '1px';
  const cellW = 2048 / 3;
  const maxW = 520; // 采样区 560 内留边

  const fitFont = (text, base, family, weight) => {
    let size = base;
    for (;;) {
      g.font = `${weight} ${size}px ${family}`;
      if (g.measureText(text).width <= maxW || size <= 14) return size;
      size -= 2;
    }
  };

  SCENES.forEach((s, i) => {
    const cx = i * cellW + cellW / 2;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.shadowColor = 'rgba(0,0,0,0.78)';
    g.shadowBlur = 10;
    g.fillStyle = '#ffffff';
    fitFont(s.name, 96, 'Georgia, "Songti SC", "Hiragino Sans GB", serif', 600);
    g.fillText(s.name, cx, 106);
    g.shadowBlur = 6;
    g.fillStyle = 'rgba(226,234,248,0.96)';
    fitFont(s.tag, 40, '-apple-system, "PingFang SC", "Hiragino Sans GB", sans-serif', 500);
    g.fillText(s.tag, cx, 196);
  });
  return cv;
}

export default function KaleidoCanvas({ onEnter }) {
  const ref = useRef(null);
  const enterRef = useRef(onEnter);
  useEffect(() => { enterRef.current = onEnter; }, [onEnter]);

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

    // 标签图集纹理（TEXTURE0）
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, makeAtlas());
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const u = (name) => gl.getUniformLocation(prog, name);
    const uRes = u('uRes'), uTime = u('uTime'), uMouse = u('uMouse');
    const uSpin = u('uSpin'), uFlowT = u('uFlowT'), uHueT = u('uHueT');
    const uMorphK = u('uMorphK');
    const uMorphA = u('uMorphA'), uMorphB = u('uMorphB');
    const uCtr = u('uCtr'), uRing = u('uRing'), uWinA = u('uWinA'), uWinB = u('uWinB');
    const uHover = u('uHover');
    const uAcc0 = u('uAcc0'), uAcc1 = u('uAcc1'), uAcc2 = u('uAcc2');
    const uCardA = u('uCardA'), uCardB = u('uCardB');
    const uAtlas = u('uAtlas');
    gl.uniform1i(uAtlas, 0);
    gl.uniform3f(uAcc0, ...SCENES[0].acc);
    gl.uniform3f(uAcc1, ...SCENES[1].acc);
    gl.uniform3f(uAcc2, ...SCENES[2].acc);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const host = canvas.closest('.kaleido') || document.body;

    // 交互状态（全部在 JS 侧阻尼/衰减，shader 只吃结果）
    const st = {
      mx: 0, my: 0,        // 阻尼后的鼠标
      tx: 0, ty: 0,        // 目标鼠标
      spin: 0,             // 折叠旋转相位（初值与旧版一致：0）
      flow: 0,             // 域扭曲流动相位
      hueT: 0,             // 色相流转相位（0.42 时钟，速率同旧版）
      animT: 0,            // 动画时钟（窗缘呼吸）
      surge: 0,            // 换世界「甩尾」角速度（指数衰减）
      wFrom: 0, wTo: 0,    // 双形态：来源/目标世界
      morphK: 1,           // 混合系数（1 = 已稳定在 wTo）
      hoverW: [0, 0, 0],   // 三环（场景）悬停权重（阻尼）
      hoverTarget: -1,
      // 嵌窗几何（px 与 uv 两份，命中测试与 uniform 共用同一来源）
      ctr: { cx: 0, cy: 0 },           // 万花筒中心（CSS px）
      ctrUv: [0, 0],                   // 同一中心的 uv 坐标
      ringsPx: [0, 0, 0],              // 三环半径（px）
      aPx: 0,                          // 窗径向半厚（px）
      bPx: [0, 0, 0],                  // 三环切向半宽（px）
      nMix: 8,                         // 当前混合折数（命中测试用）
      last: 0,
      raf: 0,
      running: false,
    };

    // 嵌窗布局：环系长在万花筒上（同心、随布局中心定位）。
    // 桌面：中心中偏右（避让左侧标题卡，配合遮挡淡出）；移动端：标题在上，
    // 中心下移。三环半径与窗尺寸由 min(W,H) 与安全边距决定；切向半宽随
    // 折数自适应（密折世界自动收窄）。遮挡区（标题卡/底部提示条）的 uv
    // 矩形一并读出，shader 内窗在其附近淡出、命中检测直接忽略。
    const layoutWindows = () => {
      const W = canvas.clientWidth || 1;
      const H = canvas.clientHeight || 1;
      const mob = W < 760;
      const unit = mob ? Math.min(W, H * 0.72) : Math.min(W, H);
      const cx = mob ? W / 2 : W * 0.56;
      const cy = mob ? H * 0.56 : H / 2;
      let R0, R2;
      if (mob) {
        const vTop = cy, vBot = H - cy;
        const a0 = 0.052 * unit;
        R2 = Math.min(W * 0.5, Math.min(vTop, vBot)) - a0 - 6;
        R0 = R2 * 0.42;
        const spacing = (R2 - R0) / 2;
        st.aPx = Math.max(spacing * 0.38, 12);
      } else {
        R0 = 0.19 * unit;
        R2 = 0.4475 * unit;
        st.aPx = 0.0518 * unit;
      }
      const R1 = (R0 + R2) / 2;
      st.ctr = { cx, cy };
      st.ringsPx = [R0, R1, R2];
      const m = Math.min(W, H);
      st.ctrUv = [((2 * cx / W - 1) * (W / m)), ((1 - 2 * cy / H) * (H / m))];
      // uv 半径
      const ru = st.ringsPx.map((R) => R / m);
      const au = st.aPx / m;
      st._ru = ru; st._au = au;
      st._bu = [0, 0, 0];
      st._fill = mob ? [0.46, 0.46, 0.46] : [0.46, 0.40, 0.40];

      // 遮挡区矩形（uv y 向上 + px 两份）；无元素时放到远处
      const readRect = (sel) => {
        const el = host.querySelector(sel);
        if (!el) return { uv: [9, 8.9, 9.1, 9], px: null };
        const r = el.getBoundingClientRect();
        const pad = 10;
        const px = { l: r.left - pad, t: r.top - pad, r: r.right + pad, b: r.bottom + pad };
        const uv = [
          (2 * px.l / W - 1) * (W / m),
          (1 - 2 * px.b / H) * (H / m),
          (2 * px.r / W - 1) * (W / m),
          (1 - 2 * px.t / H) * (H / m),
        ];
        return { uv, px };
      };
      st.cardA = readRect('.kaleido-copy');
      st.cardB = readRect('.kaleido-foot');
    };

    // 每帧按当前（混合）折数刷新切向半宽：b = fill·弧长，封顶 2.6a
    const updateWinB = () => {
      const m = Math.min(canvas.clientWidth || 1, canvas.clientHeight || 1);
      for (let k = 0; k < 3; k++) {
        const arc = Math.PI * 2 * st._ru[k] / st.nMix;
        st._bu[k] = Math.min(arc * st._fill[k], st._au * 2.6);
        st.bPx[k] = st._bu[k] * m;
      }
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
      layoutWindows();
    };

    // 命中检测：与着色器同一几何（uv → 极坐标 → fold → 窗 SDF），返回环号（场景）
    const hitWindow = (x, y) => {
      // 遮挡区（标题卡/底部提示条）内不算窗——点它等同点空白
      for (const c of [st.cardA, st.cardB]) {
        if (c.px && x >= c.px.l && x <= c.px.r && y >= c.px.t && y <= c.px.b) return -1;
      }
      const W = canvas.clientWidth || 1, H = canvas.clientHeight || 1;
      const m = Math.min(W, H);
      const ux = (2 * x - W) / m;
      const uy = (H - 2 * y) / m;               // uv y 向上
      const px = ux - (st.ctrUv[0] + st.mx * 0.15);
      const py = uy - (st.ctrUv[1] + st.my * 0.15);
      const r = Math.hypot(px, py);
      if (r > st._ru[2] + st._au * 1.6) return -1;
      const aO = Math.atan2(py, px) + st.spin;
      const seg = Math.PI * 2 / st.nMix;
      const thW = ((aO % seg) + seg) % seg;
      const aa = Math.abs(thW - seg * 0.5);     // 折叠角（0 = 镜像轴）
      const fx = r * Math.cos(aa), fy = r * Math.sin(aa);
      for (let k = 0; k < 3; k++) {
        const qx = fx - st._ru[k], qy = fy;
        const wL = st._bu[k] * (1 + 0.16 * Math.max(-1, Math.min(1, qx / st._au)));
        const rad = 0.34 * Math.min(st._au, wL);
        const dx = Math.abs(qx) - st._au + rad, dy = Math.abs(qy) - wL + rad;
        const d = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - rad;
        if (d <= 0) return k;
      }
      return -1;
    };

    const draw = (now) => {
      resize();
      const dt = st.last ? Math.min((now - st.last) / 1000, 0.05) : 0.016;
      st.last = now;

      // 鼠标阻尼（帧率无关的指数阻尼）
      const k = 1 - Math.pow(0.0025, dt);
      st.mx += (st.tx - st.mx) * k;
      st.my += (st.ty - st.my) * k;

      // 世界混合推进（约 1s 交叉渐变）
      if (st.morphK < 1) st.morphK = Math.min(1, st.morphK + dt / 1.05);
      const e = st.morphK * st.morphK * (3 - 2 * st.morphK);
      const A = WORLDS[st.wFrom], B = WORLDS[st.wTo];
      const mixF = (a, b) => a + (b - a) * e;
      st.nMix = mixF(A.n, B.n);

      // 甩尾：过场角速度脉冲，指数衰减（幅度克制）
      st.surge *= Math.exp(-dt * 2.3);
      st.spin += dt * (mixF(A.spin, B.spin) + st.mx * 0.0072 + st.surge);
      // 流速 / 色相流转：基准速率与旧版 0.42 相位时钟一致
      st.flow += dt * 0.42 * mixF(A.flow, B.flow);
      st.hueT += dt * 0.42;
      st.animT += dt;

      updateWinB();

      // 悬停权重阻尼（快速但不跳变）
      const hk = 1 - Math.pow(0.001, dt);
      for (let s = 0; s < 3; s++) {
        st.hoverW[s] += ((st.hoverTarget === s ? 1 : 0) - st.hoverW[s]) * hk;
      }

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, st.animT);
      gl.uniform2f(uMouse, st.mx, st.my);
      gl.uniform1f(uSpin, st.spin);
      gl.uniform1f(uFlowT, st.flow);
      gl.uniform1f(uHueT, st.hueT);
      gl.uniform1f(uMorphK, e);
      gl.uniform4f(uMorphA, A.n, A.hue, A.warp, 0);
      gl.uniform4f(uMorphB, B.n, B.hue, B.warp, 0);
      gl.uniform2f(uCtr, st.ctrUv[0], st.ctrUv[1]);
      gl.uniform3f(uRing, st._ru[0], st._ru[1], st._ru[2]);
      gl.uniform1f(uWinA, st._au);
      gl.uniform3f(uWinB, st._bu[0], st._bu[1], st._bu[2]);
      gl.uniform3f(uHover, st.hoverW[0], st.hoverW[1], st.hoverW[2]);
      gl.uniform4f(uCardA, ...st.cardA.uv);
      gl.uniform4f(uCardB, ...st.cardB.uv);
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

    // 点空白 → 换世界（过场中忽略连点；reduced 直接瞬切并重绘单帧）
    const nextWorld = () => {
      if (st.morphK < 1) return;
      st.wFrom = st.wTo;
      st.wTo = (st.wTo + 1) % WORLDS.length;
      if (reduced) {
        st.morphK = 1;
        st.surge = 0;
        draw(performance.now());
        return;
      }
      st.morphK = 0;
      st.surge = (WORLDS[st.wTo].spin >= 0 ? 1 : -1) * 1.1;
    };

    const updateHover = (x, y) => {
      const hit = hitWindow(x, y);
      if (hit !== st.hoverTarget) {
        st.hoverTarget = hit;
        host.style.cursor = hit >= 0 ? 'pointer' : '';
        if (reduced) {
          // 静止模式：直接设权重并重绘单帧
          for (let s = 0; s < 3; s++) st.hoverW[s] = hit === s ? 1 : 0;
          draw(performance.now());
        }
      }
    };

    const onMove = (e) => {
      st.tx = (e.clientX / window.innerWidth) * 2 - 1;
      st.ty = -((e.clientY / window.innerHeight) * 2 - 1);
      updateHover(e.clientX, e.clientY);
    };
    const onDown = (e) => {
      // 点在真实链接/按钮上时不抢语义
      if (e.target && e.target.closest && e.target.closest('a,button')) return;
      const hit = hitWindow(e.clientX, e.clientY);
      if (hit >= 0) {
        enterRef.current(SCENES[hit].path); // 点窗 → 进场景
        return;
      }
      nextWorld(); // 点空白 → 换世界
    };
    const onVis = () => { if (document.hidden) stop(); else start(); };
    const onResize = () => { if (reduced || !st.running) draw(performance.now()); };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('resize', onResize);

    // 自动化测试只读钩子：当前所有嵌窗的屏幕位置 / 尺寸 / 场景号
    window.__kaleidoWindows = () => {
      const W = canvas.clientWidth || 1, H = canvas.clientHeight || 1;
      const m = Math.min(W, H);
      const nR = Math.max(3, Math.round(st.nMix));
      const seg = Math.PI * 2 / nR;
      const cX = st.ctrUv[0] + st.mx * 0.15;
      const cY = st.ctrUv[1] + st.my * 0.15;
      const wins = [];
      for (let i = 0; i < nR; i++) {
        const thM = (i + 0.5) * seg - st.spin;
        for (let k = 0; k < 3; k++) {
          const ux = cX + st._ru[k] * Math.cos(thM);
          const uy = cY + st._ru[k] * Math.sin(thM);
          wins.push({
            scene: k,
            x: (ux * m + W) / 2,
            y: (H - uy * m) / 2,
            a: st._au * m,     // 径向半厚（px，方向 thM）
            b: st._bu[k] * m,  // 切向半宽（px）
            thM,
          });
        }
      }
      return { n: nR, world: st.wTo, card: st.cardA.px, foot: st.cardB.px, wins };
    };

    // 标题卡入场动画（copyIn 1.1s）结束后重读一次遮挡矩形，动画期间用近似值
    const rectTimer = window.setTimeout(() => { layoutWindows(); if (reduced) draw(performance.now()); }, 1600);

    if (reduced) {
      // 静止渲染单帧：固定相位（不动画、不甩尾），窗仍可悬停/点击进入
      st.mx = st.my = 0;
      draw(performance.now());
    } else {
      start();
    }

    return () => {
      stop();
      window.clearTimeout(rectTimer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', onResize);
      host.style.cursor = '';
      delete window.__kaleidoWindows;
      gl.deleteTexture(tex);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      // 注意：不主动 loseContext —— StrictMode 会卸载重挂，同一个 canvas
      // 再 getContext 会拿到已丢失的上下文导致编译失败（300x150 黑屏）。
      // 上面 delete* 已足够释放 GPU 资源。
    };
  }, []);

  return <canvas className="kaleido-canvas" ref={ref} aria-hidden="true" />;
}
