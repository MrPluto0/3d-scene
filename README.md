# 万花筒 · 3d-scene

创意 3D 场景集：一个 WebGL 万花筒首页 + 每个场景一条路由。所有场景纯代码程序化生成（含 Blender 导出的 GLB），无外部模型资产。

在线：**https://3d-scene.vercel.app**

## 场景

| # | 场景 | 路由 | 说明 |
|---|------|------|------|
| 01 | 雪夜馄饨摊 | `/wonton-mini` | 纯 three.js 三渲二：手写渐变映射、暖灯泡 vs 冷路灯、落雪与蒸汽 |
| 02 | 馄饨摊 · 重制 | `/stall` · `/stall/live` | Blender 建模导 GLB 实时渲染 + 渲染图集（EEVEE 四机位与转盘视频） |
| 03 | 天空之城 | `/sky-city` | 程序化王城：沉积层理浮岩、飞扶壁主塔、三孔长桥、瀑布与四层云海 |

首页 `/` 是原生 WebGL 万花筒：场景入口嵌在镜像花纹的玻璃窗里，**点窗进场景，点空白换世界，移动鼠标改变转法**。

## 技术栈

- Vite + React 18 + react-router v6
- three.js 0.169（npm 包，全站统一版本）
- 零 UI 框架、零 3D 资产文件——所有几何、纹理、环境贴图由代码生成

## 目录结构

```
src/
  main.jsx               # 路由入口
  pages/                 # 页面：Home / WontonMini / StallGallery / StallLive / SkyCity
  scenes/                # 场景模块，统一 init(container) → { setView, setOrbit, dispose } → cleanup
    wontonMiniScene.js   #   馄饨摊（三渲二）
    wontonmini/          #     └ 构建模块（base/stall/props/particles/toon）
    wontonStallScene.js  #   馄饨摊（GLB 实时查看器，三渲二/写实可切）
    skyCityScene.js      #   天空之城入口
    skycity/             #     └ 五模块（kit/terrain/architecture/water/atmosphere）
  assets/                # GLB、静帧、转盘视频（Vite 哈希打包）
public/
  audio/bgm.m4a          # 全站 BGM
```

场景模块约定：`cleanup()` 必须取消 RAF、解绑监听、dispose 全部 geometry/material/texture 并移除 canvas——StrictMode 双挂载与路由切换都依赖它不泄漏。

## 开发

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 产物 dist/
```

## 部署

Vercel 关联 GitHub `main` 分支，push 即自动部署。
