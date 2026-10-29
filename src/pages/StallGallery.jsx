// /stall — 雪夜馄饨摊图集页：hero 静帧 + 环景视频 + 四机位画廊（灯箱）
// + 场景笔记三卡 + 「自己转着看」入口。文案移植自 wonton-stall/index.html。
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import heroImg from '../assets/stall/01_hero_iso.jpg';
import tableImg from '../assets/stall/02_low_table.jpg';
import streetImg from '../assets/stall/03_street_puddle.jpg';
import shoulderImg from '../assets/stall/04_over_shoulder.jpg';
import turntableMp4 from '../assets/stall/turntable.mp4';

const SHOTS = [
  {
    img: heroImg, title: '街角全景', cam: 'HERO · ORTHO 50MM EQ',
    cap: '等距俯瞰：暖光从棚下溢出，脚印从马路一直走到桌前。灯笼、灯泡、蒸汽，三个暖点钉住画面。'
  },
  {
    img: tableImg, title: '桌前仰望', cam: 'LOW TABLE · 50MM · F2.4',
    cap: '趴在桌边的高度往摊里看：帆布的波浪檐、吊灯的光晕、两柱蒸汽直冲进冷空气里。'
  },
  {
    img: streetImg, title: '街的对面', cam: 'STREET · 34MM · F2.4',
    cap: '站在马路对面看过来：湿漉漉的路面接住所有光，路灯的冷白和摊子的暖橙在积水里各占一边。'
  },
  {
    img: shoulderImg, title: '最后一碗', cam: 'OVER SHOULDER · 44MM · F2.2',
    cap: '坐在那个位置：从他肩后看向冒着热气的锅。今晚最后一碗，慢慢吃。'
  },
];

const NOTES = [
  {
    h: '光',
    items: [
      ['一盏裸灯泡', '（320W 暖光）吊在棚檐，是全场唯一的主光'],
      ['红灯笼', '挂在左柱，给雪地染一小块红'],
      ['街灯冷白', '从画面另一侧压住马路，冷 VS 暖拉开层次'],
      ['月光 3W 蓝青', '铺底，让暗部不死黑'],
    ],
  },
  {
    h: '雪与汽',
    items: [
      ['落雪 5000 粒', '、缓降 1.1m/s，落地即隐'],
      ['棚顶积雪', '压出弧度，前檐挂雪肠'],
      ['锅上', '体积蒸汽冒出棚脊，混进飘雪里'],
      ['路面湿反射', '接住所有光源'],
    ],
  },
  {
    h: '叙事细节',
    items: [
      ['脚印', '从马路一路踩到桌前'],
      ['吃完的碗，', '筷子架在碗沿'],
      ['半瓶辣油、一杯筷子、一只空凳积着雪', ''],
      ['侧帘被风掀起一角，', '墙上的菜单还亮着'],
    ],
  },
];

export default function StallGallery() {
  const [zoom, setZoom] = useState(null);   // 打开的图下标，null 关闭

  // 灯箱：ESC 关闭
  useEffect(() => {
    if (zoom === null) return;
    const onKey = (e) => { if (e.key === 'Escape') setZoom(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom]);

  return (
    <main className="gallery">
      <Link to="/" className="gallery-back" aria-label="返回首页">← 三维实验场</Link>

      {/* ---------- hero ---------- */}
      <header className="g-hero">
        <img className="g-hero-img" src={heroImg} alt="雪夜馄饨摊 等距全景" />
        <div className="g-hero-inner">
          <p className="g-kicker">Blender Diorama · 雪国深夜食堂</p>
          <h1>雪夜馄饨摊</h1>
          <p className="g-hero-sub">寒夜里的一口热气</p>
          <Link to="/stall/live" className="g-cta">自己转着看 · 交互 3D →</Link>
        </div>
      </header>

      {/* ---------- 环景摆动 ---------- */}
      <section className="g-sec">
        <div className="g-sec-head"><span className="g-sec-no">01</span><h2>环景摆动</h2></div>
        <p className="g-sec-desc">
          摊位有墙、有背面，所以不做 360° 旋转，而是让镜头从前右到前左 120° 缓缓摆动——
          像一个人绕着这个街角，慢慢走了一小段。
        </p>
        <div className="g-video">
          <video src={turntableMp4} autoPlay muted loop playsInline />
        </div>
        <p className="g-video-note">150 FRAMES · 30 FPS · ORTHOGRAPHIC 50° · AZIMUTH 45° → 165° → 45°</p>
      </section>

      {/* ---------- 机位 ---------- */}
      <section className="g-sec">
        <div className="g-sec-head"><span className="g-sec-no">02</span><h2>机位</h2></div>
        <p className="g-sec-desc">一个等距全景定调，三个电影机位讲同一个夜晚的不同视角。点击可放大。</p>
        <div className="g-grid">
          {SHOTS.map((s, i) => (
            <figure key={s.title} className="g-shot" onClick={() => setZoom(i)}>
              <img src={s.img} alt={s.title} loading="lazy" />
              <figcaption className="g-shot-info">
                <span className="g-shot-title">{s.title}</span>
                <span className="g-shot-cam">{s.cam}</span>
              </figcaption>
              <p className="g-shot-cap">{s.cap}</p>
            </figure>
          ))}
        </div>
      </section>

      {/* ---------- 场景笔记 ---------- */}
      <section className="g-sec">
        <div className="g-sec-head"><span className="g-sec-no">03</span><h2>场景笔记</h2></div>
        <p className="g-sec-desc">
          立意取自街角便利店的经典配方——一个巴掌大的角落世界、一种天气、一盏有故事的光——
          换成我们自己的深夜路边摊。
        </p>
        <div className="g-notes">
          {NOTES.map((n) => (
            <div key={n.h} className="g-note">
              <h3>{n.h}</h3>
              <ul>
                {n.items.map(([b, rest], i) => (
                  <li key={i}>{b ? <b>{b}</b> : null}{rest}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <footer className="g-footer">
        <span>雪夜馄饨摊 · WONTON STALL, SNOWY NIGHT</span>
        <Link to="/stall/live">自己转着看 · /stall/live →</Link>
      </footer>

      {/* ---------- 灯箱 ---------- */}
      {zoom !== null && (
        <div className="g-lightbox" role="dialog" aria-modal="true" aria-label={`${SHOTS[zoom].title} 放大视图`} onClick={() => setZoom(null)}>
          <img src={SHOTS[zoom].img} alt={SHOTS[zoom].title} onClick={(e) => e.stopPropagation()} />
          <div className="g-lightbox-cap">
            <span className="g-shot-title">{SHOTS[zoom].title}</span>
            <span className="g-shot-cam">{SHOTS[zoom].cam}</span>
          </div>
          <button type="button" className="g-lightbox-close" aria-label="关闭（ESC）" onClick={() => setZoom(null)}>✕ ESC</button>
        </div>
      )}
    </main>
  );
}
