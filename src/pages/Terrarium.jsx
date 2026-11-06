// 悬浮玻璃立方体微缩生态 No.07（DeepSeek 重设计版）。
// 场景是自包含静态页（index.html + main.js + 本地 vendored three），
// 按仓库约定拷入 public/terrarium/，同源 iframe 全屏嵌入，不改其一行代码。
export default function Terrarium() {
  return (
    <iframe
      className="scene-iframe"
      src="/terrarium/index.html"
      title="悬浮生态舱 No.07 · 玻璃立方体微缩生态"
      allow="fullscreen"
    />
  );
}
