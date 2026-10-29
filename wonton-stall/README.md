# 雪夜馄饨摊 · 3D Diorama

- `index.html` — 成品图集（4 机位静帧 + 摆动视频 + 场景笔记）
- `viewer.html` — 交互 3D（拖拽旋转/缩放/平移，机位预设，自动环绕，落雪、蒸汽脉冲、灯笼摆动、棚下灯泡串、柜台下打盹的黑猫）。
  GLB 已内嵌，three.js 走仓库内 `vendor/`，部署到任意静态托管即可。
- `wonton-stall.glb` — 场景模型（220 网格 / 39 材质 / 7 灯光 / 条纹贴图）
- `renders/` — Blender EEVEE 渲染成品
- 场景源文件在 Blender 场景库 `wonton-stall.blend`

制作：Blender 5.2 全程序化建模 → EEVEE 渲染 + glTF 导出 → three.js 实时版。
