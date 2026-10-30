// 落地页 ——「特效即品牌」：真·万花筒。
// 全屏原生 WebGL fragment shader（多镜像对称 + FBM 域扭曲 + 光谱色相流转）
// 作为站点身份本身，不绑定任何场景题材；场景入口做成漂浮的「棱镜碎片」
// 玻璃面板，只写场景名与一句 tag。
import { Link } from 'react-router-dom';
import KaleidoCanvas from '../components/KaleidoCanvas';

export default function Home() {
  return (
    <main className="kaleido">
      <KaleidoCanvas />

      <section className="kaleido-copy">
        <p className="kaleido-kicker">KALEIDOSCOPE</p>
        <h1 className="kaleido-title">万花筒</h1>
        <p className="kaleido-sub">转一下，换一个世界。</p>
      </section>

      <nav className="kaleido-shards" aria-label="场景入口">
        <Link to="/wonton-mini" className="shard shard--a">
          <span className="shard-no">01</span>
          <h2 className="shard-name">雪夜馄饨摊</h2>
          <p className="shard-tag">手写 shader · 实时三渲二</p>
        </Link>
        <Link to="/stall" className="shard shard--b">
          <span className="shard-no">02</span>
          <h2 className="shard-name">馄饨摊 · 重制</h2>
          <p className="shard-tag">Blender GLB · 图集与实时</p>
        </Link>
      </nav>

      <footer className="kaleido-foot">
        <span className="kaleido-foot-desk">移动鼠标改变转法 · 点击绽放一次</span>
        <span className="kaleido-foot-mob">轻触改变转法 · 点按绽放一次</span>
      </footer>
    </main>
  );
}
