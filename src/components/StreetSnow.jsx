// 落地雪层：单个低开销 canvas，~120 片雪，只在 rAF 里移动圆点。
// prefers-reduced-motion 时直接不画。CSS 负责其余一切。
import { useEffect, useRef } from 'react';

export default function StreetSnow() {
  const ref = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let w = 0;
    let h = 0;
    let flakes = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // 桌面约 0.09 片/千像素²，390 宽手机约 60 片
      const n = Math.round(Math.min(150, (w * h) / 14000));
      flakes = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.6 + Math.random() * 1.5,
        v: 16 + Math.random() * 30,        // px/s
        ph: Math.random() * Math.PI * 2,
        ds: 0.4 + Math.random() * 0.8,     // 漂移频率
        a: 0.22 + Math.random() * 0.45,
      }));
    };

    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = now / 1000;
      ctx.clearRect(0, 0, w, h);
      for (const f of flakes) {
        f.y += f.v * dt;
        f.x += Math.sin(t * f.ds + f.ph) * 14 * dt;
        if (f.y > h + 4) {
          f.y = -4;
          f.x = Math.random() * w;
        }
        ctx.globalAlpha = f.a;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fillStyle = '#dfe6f2';
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };

    resize();
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas className="street-snow" ref={ref} aria-hidden="true" />;
}
