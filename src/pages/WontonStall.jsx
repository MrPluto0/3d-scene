// wonton-stall viewer is a fully self-contained single HTML file (inlined GLB);
// served as-is from /stall/viewer.html and embedded full-screen, no wrapper UI.
export default function WontonStall() {
  return (
    <iframe
      className="full-iframe"
      src="/stall/viewer.html"
      title="雪夜馄饨摊 · GLB 实时查看器"
      allow="fullscreen"
    />
  );
}
