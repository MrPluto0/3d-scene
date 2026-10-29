# 雪夜馄饨摊 · wonton-mini

纯 three.js 几何体搭出的「雪夜馄饨摊」微缩街角 diorama：三渲二（MeshToonMaterial + 3 级 gradientMap）+ 关键物件 inverted-hull 描边，冷暖对撞打光，UnrealBloom 轻量辉光，全场持续落雪 + 锅口蒸汽。无任何 UI，全屏 canvas + OrbitControls（阻尼，可拖拽/旋转/缩放）。

## 运行

ES module + import map 需要走 http（`file://` 打开会被浏览器 CORS 拦住）。在**本目录**下任选其一：

```bash
python3 -m http.server 8000
# 然后浏览器打开 http://localhost:8000/
```

## 结构

- `index.html` — import map（指向 `./vendor/`，与 wonton-stall 同款）
- `main.js` — 渲染器 / 相机 / 雾 / 灯光 / bloom / 动画循环
- `modules/toon.js` — gradientMap、toon 材质、描边、canvas 贴图、假倒影光斑
- `modules/base.js` — 底座、L 形街角路面、人行道、积雪、斑马线、停车位线、排水沟、背景楼 + 暗巷
- `modules/stall.js` — 棚顶压雪/雪檐、锅+蒸汽源、灶台、调料架、菜单灯箱、灯泡串、红灯笼、煤气罐、黑猫
- `modules/props.js` — 折叠桌/塑料凳、残局餐具、脚印、路灯、电线杆+垂线电线、路牌、护栏、垃圾桶、伞架、自行车、贩卖机、公告栏
- `modules/particles.js` — 落雪 Points(1700) + 蒸汽 Sprites
- `vendor/` — 本地 three.js（r169），从 wonton-stall/vendor 复制，未改动

不依赖 wonton-stall 目录，纯静态、无构建步骤。
