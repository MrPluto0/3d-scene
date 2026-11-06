// 全屏原生 WebGL 万花筒背景（零依赖，不引 three）。
// 结构分两层：
//   ① 世界层：四套「世界形态」（折数 8/6/12/9 + 色盘 + 域扭曲性格 + 转向转速），
//      点击空白循环切换；uMorphA/uMorphB 双形态参数交叉渐变（约 1s），
//      同时给旋转相位一次指数衰减的「甩尾」加速，作为过场。
//   ② 镜室镜片层：三场景入口是镶在万花筒镜室里的 9 颗「镜片宝石」——
//      在【未折叠的屏幕极坐标空间】沿环均匀分布（9 折对称，每扇区一颗），
//      三场景循环分配（每景 3 颗）；宝石为斜切琉璃片（六边形/菱形，带亮边
//      斜面），内部为场景专属色内发光 + 竖向渐变，标签文字用离屏 canvas
//      生成的中文纹理图集（2048×256，2x 分辨率、linear+mipmap 过滤）。
//      镜片层独立于世界层：换世界时 9 颗镜片保持稳定，导航永远可用。
// 交互：鼠标阻尼影响旋转与扭曲中心（保留）；悬停做极坐标反算命中，
//      命中场景的 3 颗镜片同时提亮、标签变白、光脉动加速；点击镜片直达
//      场景路由；点击空白换世界。页面不可见暂停 RAF；
//      prefers-reduced-motion 时只渲染一帧静止画面（点击直接瞬切）。
import { useEffect, useRef } from 'react';

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;

uniform vec2  uRes;
uniform float uTime;     // 动画时钟（内发光脉动 / 色相微流转）
uniform vec2  uMouse;    // 阻尼后的鼠标偏移 -1..1
uniform float uSpin;     // 折叠旋转相位（含换世界「甩尾」加速）
uniform float uFlowT;    // 域扭曲流动相位（按当前世界流速累计）
uniform float uMorphK;   // 双形态混合系数（JS 侧已缓动）
uniform vec4  uMorphA;   // 形态A：折数 / 色相基 / 扭曲量 / 保留
uniform vec4  uMorphB;   // 形态B
uniform vec4  uMorphA2;  // 形态A2：色散 / 锐利 / 星尘 / 保留
uniform vec4  uMorphB2;  // 形态B2
uniform vec2  uLensCtr;  // 镜片环中心（uv，随布局定位）
uniform float uLensR;    // 镜片环半径（uv）
uniform float uLensRot;  // 镜片环缓转角（随万花筒整体旋转）
uniform float uGemR;     // 宝石外接半径（uv）
uniform vec3  uHover;    // 三场景悬停权重（JS 阻尼）
uniform vec3  uColA[3];  // 各场景顶部色（竖向渐变亮端）
uniform vec3  uColB[3];  // 各场景底部色（竖向渐变暗端）
uniform sampler2D uAtlas; // 中文标签图集（3 格，各用中央 440px）

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

// 斜切宝石 SDF：正 n 边形（rot 为某条边法线方向）。
// 按边法线把角度折叠进 [-pi/n, pi/n] 的半边楔形，等价于到
// 「内切半径 x 半边长」矩形的距离 —— 对凸多边形是精确 SDF。
float sdGem(vec2 p, float R, float n, float rot) {
  float b = 3.14159265 / n;
  float a = atan(p.y, p.x) - rot;
  a = mod(a + b, 2.0 * b) - b;
  float rr = length(p);
  vec2 q = vec2(rr * cos(a), rr * sin(a));
  vec2 df = q - vec2(R * cos(b), R * sin(b));
  vec2 mx = max(df, vec2(0.0));
  return length(mx) + min(max(df.x, df.y), 0.0);
}

// 世界纹样：折数 / 色相基 / 扭曲量 / 色散 / 锐利 / 星尘 全参数化，
// 双形态混合后单次求值（性能：与旧版相同的 5 次 fbm）。
vec3 pattern(vec2 p, float n, float hue0, float warpAmt,
             float spread, float sharp, float spark) {
  vec2 fp = fold(p, n, uSpin);
  float rr = length(p);
  float halfSeg = TAU / (2.0 * n);
  float aa = atan(fp.y, fp.x);                     // ∈ [0, halfSeg]，随镜像自动对称
  float petal = sin(clamp(aa / halfSeg, 0.0, 1.0) * 3.14159);
  float petalWrap = 0.35 + 0.65 * petal;           // 花瓣包络，扇区秩序可读

  // FBM 域扭曲（扭曲量 = 世界性格：流动 1.8 / 棱镜 1.15 / 丝绸 2.6 / 星尘 0.95）
  vec2 q = fp * 1.1;
  vec2 w = vec2(
    fbm(q + vec2(1.7, 9.2) + 0.05 * uFlowT),
    fbm(q + vec2(8.3, 2.8) - 0.04 * uFlowT)
  );
  q += warpAmt * w;
  float f1 = fbm(q);
  float f2 = fbm(q * 2.4 + f1 * 1.3 + 0.12 * uFlowT);
  float f3 = fbm(q * 5.2 + f2 * 1.5 - 0.09 * uFlowT);

  // 脊线：锐利度高 → 细亮芯（棱镜/星尘）；低 → 芯线消失只剩柔光（丝绸）
  float ridge = 1.0 - abs(f2 * 2.0 - 1.0);
  float lo = 0.985 - (1.0 - sharp) * 0.12;
  float core = smoothstep(lo, lo + 0.125, ridge);
  float glow = pow(smoothstep(0.52, 0.96, ridge), 2.0 / (0.7 + 0.3 * sharp));
  float ridge3 = 1.0 - abs(f3 * 2.0 - 1.0);
  float core3 = smoothstep(0.88, 0.99, ridge3);

  float falloff = 1.0 / (1.0 + rr * rr * 0.32);

  // 色相：噪声主导 + 半径/角度分光（spread 控色散强弱）+ 世界色相基 + 缓慢流转
  float hue = rr * 0.30 * spread + f1 * 0.34 + (ridge - 0.8) * 0.38
            + aa * 0.14 + hue0 + uTime * 0.012;
  vec3 tint = pal(hue);
  vec3 tintWarm = pal(hue + 0.5);

  vec3 col = vec3(0.0);
  col += tint * glow * 0.21 * falloff * petalWrap;
  col += tint * glow * 0.10 * petalWrap;
  col += mix(tint, vec3(1.0), 0.6) * core * 0.44 * falloff * petalWrap;
  col += mix(tintWarm, vec3(1.0), 0.4) * core3 * 0.30 * falloff * clamp(sharp, 0.0, 1.3) * 0.77;
  col += mix(tint, vec3(1.0), 0.5) * smoothstep(0.86, 1.0, petal) * 0.16 * falloff;
  col += tintWarm * smoothstep(0.13, 0.0, rr) * 0.13;
  col += pal(hue + 0.08) * (0.5 + 0.5 * sin(rr * 16.0 - f1 * 6.0)) * 0.045 * falloff;

  // 星尘性格：细噪高通后的闪点（仅星尘世界权重 > 0 时可见）
  float sp = pow(clamp(noise(q * 6.5 + vec2(0.0, uFlowT * 0.35)), 0.0, 1.0), 9.0);
  col += mix(tint, vec3(1.0), 0.7) * sp * spark * 2.2 * falloff;

  return col;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / min(uRes.x, uRes.y);
  vec2 p = uv - uMouse * 0.15;

  // ---- 世界层：双形态混合参数，单次求值 ----
  vec4 M  = mix(uMorphA,  uMorphB,  uMorphK);
  vec4 M2 = mix(uMorphA2, uMorphB2, uMorphK);
  vec3 col = pattern(p, M.x, M.y, M.z, M2.x, M2.y, M2.z);
  // 暗角只压纹样层；镜片层后叠加，保持入口亮度
  float vig = 1.0 - 0.30 * dot(uv * 0.52, uv * 0.52);
  col *= clamp(vig, 0.0, 1.0);

  // ---- 镜室镜片层：未折叠屏幕极坐标空间，9 折对称环，独立于换世界 ----
  vec2 rel = uv - uLensCtr;
  float la = atan(rel.y, rel.x);
  float seg9 = TAU / 9.0;
  float k9 = floor(mod((la - uLensRot) / seg9 + 0.5, 9.0)); // 最近扇区的镜片
  float sc = mod(k9, 3.0);                                   // 场景 0/1/2 循环分配
  float ang = uLensRot + k9 * seg9;
  vec2 lc = uLensCtr + uLensR * vec2(cos(ang), sin(ang));
  vec2 lp = uv - lc;   // 屏幕对齐的镜片局部坐标（标签永远正立）
  float gs = uGemR;

  // 各场景：形状（宽六边形 / 菱形 / 尖六边形）+ 专属色 + 标签框（含宽度→图集行宽映射）
  // backK：标签暗底强度（菱形底色最亮，压得更深保白字对比）
  float d; vec3 cTop; vec3 cBot; float hov; vec2 halfBox; float backK;
  if (sc < 0.5) {
    d = sdGem(lp, gs, 6.0, 0.0);      cTop = uColA[0]; cBot = uColB[0];
    halfBox = vec2(0.64, 0.34); backK = 0.72;
  } else if (sc < 1.5) {
    d = sdGem(lp, gs, 4.0, 0.785398); cTop = uColA[1]; cBot = uColB[1];
    halfBox = vec2(0.44, 0.26); backK = 0.92;
  } else {
    d = sdGem(lp, gs, 6.0, 0.523599); cTop = uColA[2]; cBot = uColB[2];
    halfBox = vec2(0.58, 0.33); backK = 0.78;
  }
  hov = sc < 0.5 ? uHover.x : (sc < 1.5 ? uHover.y : uHover.z);

  float aaPx = 0.0035;                        // 固定抗锯齿宽度（约 1.5px）
  float body = smoothstep(aaPx, -aaPx, d);
  if (body > 0.003) {
    // 内部：竖向渐变 + 场景色内发光脉动（悬停加速增幅）+ 边缘向内亮
    float v = clamp(lp.y / (gs * 0.9) * 0.5 + 0.5, 0.0, 1.0);
    vec3 inner = mix(cBot * 0.30, cTop * 0.55, v);
    float pul = 0.5 + 0.5 * sin(uTime * (1.7 + hov * 5.5) + k9 * 1.26);
    inner += cTop * (0.10 + 0.16 * pul) * (1.0 + hov * 1.15);
    float edgeIn = smoothstep(-gs * 0.34, -0.002, d);
    inner += mix(cTop, vec3(1.0), 0.25) * edgeIn * (0.30 + hov * 0.50);
    // 玻璃斜高光
    float sheen = smoothstep(0.46, 0.0, abs(lp.x * 0.62 + lp.y * 0.78 - gs * 0.16) / gs);
    inner += vec3(1.0) * sheen * 0.07;
    // 标签暗底（压暗椭圆，保证文字可读；菱形更亮压得更深）
    float back = (1.0 - smoothstep(gs * 0.28, gs * 0.55, length(lp * vec2(0.95, 1.5)))) * backK;
    vec3 gemCol = inner * (1.0 - back * 0.62);
    // 标签：图集该场景格的中央区域（行宽按 halfBox 宽高比映射，字不变形）
    vec2 tuv = lp / (halfBox * gs) * 0.5 + 0.5;
    float inside = step(0.0, tuv.x) * step(tuv.x, 1.0) * step(0.0, tuv.y) * step(tuv.y, 1.0);
    float cellW = 2048.0 / 3.0;
    float wReg = 256.0 * halfBox.x / halfBox.y;
    float x0 = sc * cellW + (cellW - wReg) * 0.5;
    vec2 auv = vec2((x0 + tuv.x * wReg) / 2048.0, tuv.y);
    float tmask = texture2D(uAtlas, auv).a * inside;
    // 平时淡染场景色，悬停转纯白
    vec3 labelCol = mix(mix(cTop, vec3(1.0), 0.55), vec3(1.0), min(hov * 1.3, 1.0));
    gemCol = mix(gemCol, labelCol, tmask * 0.94);
    col = mix(col, gemCol, body);
    // 亮边斜面：内侧高光带（高斯）+ 外圈光晕，悬停时增强变白
    float bw = gs * 0.035;
    float rim = exp(-pow((d + bw * 0.8) / (bw * 0.6), 2.0));
    vec3 rimCol = mix(mix(cTop, vec3(1.0), 0.45), vec3(1.0), 0.30 + 0.60 * min(hov * 1.3, 1.0));
    col += rimCol * rim * (0.50 + hov * 0.85);
    float halo = exp(-max(d, 0.0) / (gs * 0.11));
    col += rimCol * halo * (0.10 + hov * 0.24) * (1.0 - body * 0.6);
  }

  // 深底色 + 软滚降 + 颗粒抖动（压 banding）
  col += vec3(0.010, 0.013, 0.026);
  col = col / (1.0 + col * 0.35);
  float dith = (hash(gl_FragCoord.xy + fract(uTime) * 61.7) - 0.5);
  col += dith * (0.014 + 0.02 * (1.0 - clamp(dot(col, vec3(0.5)), 0.0, 1.0)));

  gl_FragColor = vec4(col, 1.0);
}
`;

// 三场景：路由 / 标签文案 / 专属色（宝石渐变亮端 colA、暗端 colB）
const SCENES = [
  {
    path: '/wonton-mini', name: '雪夜馄饨摊', tag: '手写 shader·实时三渲二',
    colA: [0.62, 0.88, 1.00], colB: [0.16, 0.38, 0.95], // 雪青 → 深湖蓝
  },
  {
    path: '/stall', name: '馄饨摊·重制', tag: 'Blender GLB·图集与实时',
    colA: [0.95, 0.71, 0.36], colB: [0.86, 0.34, 0.13], // 暖琥珀 → 炉火橙（压暗顶色保白字对比）
  },
  {
    path: '/sky-city', name: '天空之城', tag: '王城·云海浮空',
    colA: [0.98, 0.80, 0.52], colB: [0.42, 0.30, 0.86], // 鎏金 → 落霞紫（加深，保白字对比）
  },
];

// 四套世界形态：折数 / 色相基 / 扭曲量 / 流速 / 色散 / 锐利 / 星尘 / 自转（符号=方向）
const WORLDS = [
  { n: 8,  hue: 0.00, spread: 1.00, warp: 1.80, flow: 1.00, sharp: 1.00, spark: 0.0, spin: 0.045 },  // 流光
  { n: 6,  hue: 0.52, spread: 1.14, warp: 1.15, flow: 1.65, sharp: 1.55, spark: 0.0, spin: -0.075 }, // 棱镜
  { n: 12, hue: 0.80, spread: 0.62, warp: 2.60, flow: 0.55, sharp: 0.42, spark: 0.0, spin: 0.030 },  // 丝绸
  { n: 9,  hue: 0.62, spread: 1.05, warp: 0.95, flow: 1.25, sharp: 1.75, spark: 1.0, spin: -0.058 }, // 星尘
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

// 离屏 canvas 生成中文标签图集：2048×256（双 POT，可 mipmap），
// 3 格各用中央行区（行宽与 shader 内 halfBox 宽高比一致，字不变形）。
// 文字按 2x 以上超采样绘制，linear+mipmap 过滤保证缩小后清晰。
function makeAtlas() {
  const cv = document.createElement('canvas');
  cv.width = 2048;
  cv.height = 256;
  const g = cv.getContext('2d');
  if ('letterSpacing' in g) g.letterSpacing = '2px';
  const cellW = 2048 / 3;
  // 每格文字行宽上限（px），与 halfBox 宽高比换算一致后各留少量余量
  const maxWs = [442, 393, 410];

  // 自动缩字号直到塞进 maxW
  const fitFont = (text, base, family, weight, maxW) => {
    let size = base;
    for (;;) {
      g.font = `${weight} ${size}px ${family}`;
      if (g.measureText(text).width <= maxW || size <= 18) return size;
      size -= 2;
    }
  };

  SCENES.forEach((s, i) => {
    const cx = i * cellW + cellW / 2;
    const small = i === 1; // 菱形镜片内框更窄，用小一号字
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.shadowColor = 'rgba(0,0,0,0.72)';
    g.shadowBlur = 10;
    g.fillStyle = '#ffffff';
    fitFont(s.name, small ? 84 : 100, 'Georgia, "Songti SC", "Hiragino Sans GB", serif', 600, maxWs[i]);
    g.fillText(s.name, cx, 118);
    g.shadowBlur = 6;
    g.fillStyle = 'rgba(230,238,252,0.98)';
    fitFont(s.tag, small ? 34 : 44, '-apple-system, "PingFang SC", "Hiragino Sans GB", sans-serif', 500, maxWs[i]);
    g.fillText(s.tag, cx, 214);
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
    const uSpin = u('uSpin'), uFlowT = u('uFlowT'), uMorphK = u('uMorphK');
    const uMorphA = u('uMorphA'), uMorphB = u('uMorphB');
    const uMorphA2 = u('uMorphA2'), uMorphB2 = u('uMorphB2');
    const uLensCtr = u('uLensCtr'), uLensR = u('uLensR');
    const uLensRot = u('uLensRot'), uGemR = u('uGemR');
    const uHover = u('uHover');
    const uColA = u('uColA[0]'), uColB = u('uColB[0]');
    const uAtlas = u('uAtlas');
    gl.uniform1i(uAtlas, 0);
    const colFlat = new Float32Array(SCENES.flatMap((s) => s.colA));
    const colFlatB = new Float32Array(SCENES.flatMap((s) => s.colB));

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const host = canvas.closest('.kaleido') || document.body;

    // 交互状态（全部在 JS 侧阻尼/衰减，shader 只吃结果）
    const st = {
      mx: 0, my: 0,        // 阻尼后的鼠标
      tx: 0, ty: 0,        // 目标鼠标
      spin: 0.30,          // 折叠旋转相位
      flow: 1.4,           // 域扭曲流动相位
      animT: 0.5,          // 动画时钟（脉动/微光）
      surge: 0,            // 换世界「甩尾」角速度（指数衰减）
      wFrom: 0, wTo: 0,    // 双形态：来源/目标世界
      morphK: 1,           // 混合系数（1 = 已稳定在 wTo）
      lensRot: 0.42,       // 镜片环缓转角（独立稳定，不受换世界影响）
      hoverW: [0, 0, 0],   // 三场景悬停权重（阻尼）
      hoverTarget: -1,
      lens: { cx: 0, cy: 0, R: 1, gs: 1 },        // 镜片环几何（CSS px，命中测试用）
      lensUv: { cx: 0, cy: 0, R: 0.6, gs: 0.24 }, // 同一几何的 uv 单位（uniform 用）
      last: 0,
      raf: 0,
      running: false,
    };

    // 镜片环布局：桌面避开左侧标题面板、环心偏右；移动端标题在上、环心偏下。
    // R + 宝石半径受上下边距约束，保证 9 颗全部在屏内。
    const layoutLenses = () => {
      const W = canvas.clientWidth || 1;
      const H = canvas.clientHeight || 1;
      let cx, cy, R;
      if (W < 760) {
        cx = W / 2;
        cy = H * 0.63;
        R = Math.min(W * 0.42, (H * 0.63 - 340) / 1.42, (H - 90 - H * 0.63) / 1.42);
      } else {
        // 标题面板右缘 ≈ 8vw + 700px（max-width 620 + 内边距）
        const pw = Math.min(0.08 * W + 700, 0.56 * W);
        cx = Math.max(pw + (W - pw) / 2, W * 0.6);
        cy = H * 0.52;
        R = Math.min((W - pw) / 2 - 24, (H / 2 - 56) / 1.42);
      }
      R = Math.max(R, 90);
      const gs = R * 0.42; // 略超相邻六边形相切极限（弦距 0.684R vs 2×内切 0.727R），
      //                    // 但标签半宽 0.64gs≈0.27R < 弦距之半，文字永不被邻片遮挡
      st.lens = { ...st.lens, cx, cy, R, gs };
      const m = Math.min(W, H);
      st.lensUv = {
        cx: (2 * cx / W - 1) * (W / m),
        cy: (2 * cy / H - 1) * (H / m),
        R: R / m,
        gs: gs / m,
      };
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
      layoutLenses();
    };

    // 极坐标反算：指针命中哪颗镜片（与 shader 同一几何/同一取整），返回场景号
    const hitLens = (x, y) => {
      const { cx, cy, R, gs } = st.lens;
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > (R + gs) * (R + gs)) return -1;
      const seg = Math.PI * 2 / 9;
      let k = Math.floor((((Math.atan2(dy, dx) - st.lensRot) / seg + 0.5) % 9 + 9) % 9);
      const a = st.lensRot + k * seg;
      const lx = cx + R * Math.cos(a);
      const ly = cy + R * Math.sin(a);
      const scene = k % 3;
      const f = scene === 1 ? 0.78 : 0.90; // 菱形内切半径小，命中圈收紧
      return Math.hypot(x - lx, y - ly) <= gs * f ? scene : -1;
    };

    const draw = (now) => {
      resize();
      const dt = st.last ? Math.min((now - st.last) / 1000, 0.05) : 0.016;
      st.last = now;

      // 鼠标阻尼（帧率无关的指数阻尼）
      const k = 1 - Math.pow(0.0025, dt);
      st.mx += (st.tx - st.mx) * k;
      st.my += (st.ty - st.my) * k;

      // 世界混合推进（约 1s 交叉渐变，缓动系数）
      if (st.morphK < 1) st.morphK = Math.min(1, st.morphK + dt / 1.05);
      const e = st.morphK * st.morphK * (3 - 2 * st.morphK);
      const A = WORLDS[st.wFrom], B = WORLDS[st.wTo];

      // 甩尾：朝新世界方向的角速度脉冲，指数衰减
      st.surge *= Math.exp(-dt * 2.3);
      const spinBase = A.spin + (B.spin - A.spin) * e;
      st.spin += dt * (spinBase + st.mx * 0.05 + st.surge);
      // 流速按双形态混合累计
      st.flow += dt * 0.021 * (A.flow + (B.flow - A.flow) * e);
      st.animT += dt;
      st.lensRot += dt * 0.05; // 镜片环缓转：约 2 分钟一圈

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
      gl.uniform1f(uMorphK, e);
      gl.uniform4f(uMorphA, A.n, A.hue, A.warp, 0);
      gl.uniform4f(uMorphB, B.n, B.hue, B.warp, 0);
      gl.uniform4f(uMorphA2, A.spread, A.sharp, A.spark, 0);
      gl.uniform4f(uMorphB2, B.spread, B.sharp, B.spark, 0);
      gl.uniform2f(uLensCtr, st.lensUv.cx, st.lensUv.cy);
      gl.uniform1f(uLensR, st.lensUv.R);
      gl.uniform1f(uLensRot, st.lensRot);
      gl.uniform1f(uGemR, st.lensUv.gs);
      gl.uniform3f(uHover, st.hoverW[0], st.hoverW[1], st.hoverW[2]);
      gl.uniform3fv(uColA, colFlat);
      gl.uniform3fv(uColB, colFlatB);
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
      st.surge = (WORLDS[st.wTo].spin >= 0 ? 1 : -1) * 2.6;
    };

    const updateHover = (x, y) => {
      const hit = hitLens(x, y);
      if (hit !== st.hoverTarget) {
        st.hoverTarget = hit;
        host.style.cursor = hit >= 0 ? 'pointer' : '';
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
      const hit = hitLens(e.clientX, e.clientY);
      if (hit >= 0) {
        enterRef.current(SCENES[hit].path); // 点镜片 → 进场景
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

    // 自动化测试只读钩子：9 颗镜片的当前屏幕位置与场景号
    window.__kaleidoLenses = () => {
      const out = [];
      for (let i = 0; i < 9; i++) {
        const a = st.lensRot + i * Math.PI * 2 / 9;
        out.push({
          scene: i % 3,
          x: st.lens.cx + st.lens.R * Math.cos(a),
          y: st.lens.cy + st.lens.R * Math.sin(a),
          r: st.lens.gs,
        });
      }
      return out;
    };

    if (reduced) {
      // 静止渲染单帧：固定相位（不动画、不甩尾），镜片仍可点击进入
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
      host.style.cursor = '';
      delete window.__kaleidoLenses;
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
