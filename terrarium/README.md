# Terrarium · 悬浮玻璃立方体微缩生态 No.07

桌面摆件级 three.js 场景——一只悬浮在黄铜框石墩之上的玻璃生态舱，舱内是
程序化生成的微缩浮岛：苔草穹丘、松林、池塘、岩石、发光蘑菇与萤火虫。
支持 白昼 / 黄昏 / 夜晚 三段光照（底部按钮或键盘 1/2/3 切换，带平滑过渡）。

**零外部资产**：所有几何（地形/树/草/岩/蘑菇）、纹理（渐变/光斑/星空）、
环境贴图（PMREM 柔光箱）均由代码程序化生成；three.js r169 已本地 vendored。

## 运行

```bash
cd terrarium
python3 -m http.server 8743
# 打开 http://127.0.0.1:8743/   （?mode=day|dusk|night 可直链某一状态）
```

无构建步骤，原生 ES module + import map。双击 index.html（file://）在部分
浏览器不可用（module 限制），请走本地 http 服务。

## 文件

- `index.html` — 页面骨架 / UI / import map
- `main.js` — 场景全部逻辑（噪声、地形、生态、光照状态机）
- `vendor/build/three.module.js`、`vendor/jsm/controls/OrbitControls.js` — 本地依赖
- `verify.cjs` / `finalshots.cjs` — Playwright 无头截图验证脚本
- `screenshots/` — 交付验证截图

## 无头验证（SwiftShader）注意

本机无头 Chrome 的已知坑（2026-10 实测）：

1. **THREE.Points 在 SwiftShader 下完全不渲染**（加性/普通/带贴图与否均不可见），
   萤火虫改用 Sprite、尘埃改用 InstancedMesh 小球、星空改用 BackSide 贴图球。
2. **transmission 玻璃与舱内透明物**：玻璃须 `transparent:false + depthWrite:false`，
   让舱内水面/发光物在 transparent pass 正常叠加（否则会被玻璃片元整块覆盖）。
3. 启动参数需 `--proxy-server=direct:// --enable-unsafe-swiftshader
   --use-gl=angle --use-angle=swiftshader`；SwiftShader 仅 ~2fps，状态过渡阻尼
   必须按真实帧间隔（帧率无关）计算，截图前等待 ≥4.5s。

## 自动化接口

- `window.__TERRARIUM.ready` — 场景首帧渲染完成
- `window.__TERRARIUM.setMode('day'|'dusk'|'night')`
- `window.__TERRARIUM.setView(azimuthDeg)` — 绕目标水平转机位
