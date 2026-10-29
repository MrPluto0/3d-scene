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
    to: '/wonton-stall',
    title: '雪夜馄饨摊',
    sub: 'GLB 实时渲染',
    desc: 'Blender 建模导出的 GLB：机位预设、双击聚焦，三渲二 / 写实一键切换。',
    tag: 'GLB · PBR'
  }
];

export default function Home() {
  return (
    <main className="home">
      <header className="home-header">
        <p className="home-kicker">3D SCENE LAB</p>
        <h1>三维实验场</h1>
        <p className="home-sub">雪夜、暖灯与手写的 shader —— 每个小景都是一次实验。</p>
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
