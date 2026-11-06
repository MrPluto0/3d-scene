// 落地页 ——「特效即品牌」：真·万花筒。
// 全屏原生 WebGL fragment shader（多镜像对称 + FBM 域扭曲 + 暗色变幻色盘）
// 作为站点身份本身。场景入口是嵌在折叠空间楔形中线上的三环暗色嵌窗
// （见 KaleidoCanvas）：随镜像重复、悬停整环微亮、点击直达；
// 点空白在四套同族世界间交叉渐变。此处仅保留标题区、屏幕阅读器导航
// 与底部提示。
import { Link, useNavigate } from 'react-router-dom';
import KaleidoCanvas from '../components/KaleidoCanvas';

export default function Home() {
  const navigate = useNavigate();

  return (
    <main className="kaleido">
      <KaleidoCanvas onEnter={navigate} />

      <section className="kaleido-copy">
        <p className="kaleido-kicker">KALEIDOSCOPE</p>
        <h1 className="kaleido-title">万花筒</h1>
        <p className="kaleido-sub">转一下，换一个世界。</p>
      </section>

      {/* 视觉入口已镶进万花筒镜片；此导航仅供键盘 / 屏幕阅读器使用 */}
      <nav className="kaleido-sr" aria-label="场景入口">
        <Link to="/wonton-mini">雪夜馄饨摊</Link>
        <Link to="/stall">馄饨摊 · 重制</Link>
        <Link to="/sky-city">天空之城</Link>
      </nav>

      <footer className="kaleido-foot">
        <span className="kaleido-foot-desk">移动 改变转法 · 点镜片 进场景 · 点空白 换世界</span>
        <span className="kaleido-foot-mob">轻触镜片进入 · 轻触空白换世界</span>
      </footer>
    </main>
  );
}
