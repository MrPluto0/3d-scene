import { Link } from 'react-router-dom';

const scenes = [
  {
    to: '/wonton-mini',
    title: '雪夜馄饨摊',
    sub: '三渲二 Diorama',
    desc: '纯代码 three.js 小景：雪落、蒸汽、暖灯与克制的 bloom，蓝夜里的一个暖色角落。',
    tag: 'three.js · toon'
  },
  {
    to: '/stall',
    title: '雪夜馄饨摊',
    sub: 'GLB 图集 · 实时渲染',
    desc: 'Blender 建模导出的 GLB：机位静帧图集、环景视频，加上网页实时场景——机位预设、落雪与蒸汽。',
    tag: 'GLB · PBR'
  }
];

export default function Home() {
  return (
    <main className="home">
      <header className="home-header">
        <p className="home-kicker">KALEIDOSCOPE</p>
        <h1>万花筒</h1>
        <p className="home-sub">雪夜、暖灯与手写的 shader —— 转一下，换一个世界。</p>
      </header>

      <section className="cards">
        {scenes.map((s) => (
          <Link key={s.to} to={s.to} className="card">
            <div className="card-glow" aria-hidden="true" />
            <div className="card-tag">{s.tag}</div>
            <h2>{s.title}</h2>
            <p className="card-sub">{s.sub}</p>
            <p className="card-desc">{s.desc}</p>
            <span className="card-enter">进入场景 →</span>
          </Link>
        ))}
      </section>

      <footer className="home-footer">
        <span>夜深了，来碗馄饨。</span>
      </footer>
    </main>
  );
}
