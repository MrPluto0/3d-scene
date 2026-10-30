// 落地页 ——「深夜街上的一排发光门面」。
// 不做卡片网格：一条暗色街的立面，两个亮着暖光的门面高低错落，
// 中间夹一扇拉下卷帘的死铺。标题竖排压在左上，雪用轻量 canvas。
import { Link } from 'react-router-dom';
import StreetSnow from '../components/StreetSnow';

function Window({ ver, tag, suffix, desc }) {
  return (
    <div className="window">
      <span className="window-glow" aria-hidden="true" />
      <span className="lamp lamp--l" aria-hidden="true" />
      <span className="lamp lamp--r" aria-hidden="true" />
      <span className="shop-tag">{tag}</span>
      <h2>雪夜馄饨摊{suffix && <i className="h2-suffix">{suffix}</i>}</h2>
      <p className="shop-ver">{ver}</p>
      <p className="shop-desc">{desc}</p>
      <div className="counter">
        <span className="shop-enter">
          推门进去<i className="enter-arrow" aria-hidden="true">→</i>
        </span>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="street">
      <StreetSnow />
      <div className="skyline" aria-hidden="true" />
      <div className="street-noise" aria-hidden="true" />
      <div className="street-vignette" aria-hidden="true" />

      <header className="street-head">
        <h1 className="street-title">万花筒</h1>
        <p className="street-sub">转一下，换一个世界。</p>
        <p className="street-kicker">KALEIDOSCOPE</p>
      </header>

      <section className="street-row" aria-label="场景门面">
        {/* 01 · 三渲二实时 */}
        <Link to="/wonton-mini" className="shop shop--a">
          <span className="shop-halo" aria-hidden="true" />
          <span className="awning" aria-hidden="true">
            <span className="awning-beads" />
            <span className="awning-sign">营业中</span>
          </span>
          <span className="shop-no">01</span>
          <Window
            tag="三渲二 · 实时"
            ver="手写 shader · diorama"
            desc="纯代码 three.js 小景：雪落、蒸汽、暖灯与克制的 bloom，蓝夜里的一个暖色角落。"
          />
          <span className="shop-spill" aria-hidden="true" />
        </Link>

        {/* 卷帘拉死的空铺，只做街景节奏，不可点 */}
        <div className="shop shop--shuttered" aria-hidden="true">
          <span className="shutter-cap" />
          <div className="shutter">
            <span className="shutter-note">歇 业</span>
          </div>
        </div>

        {/* 02 · Blender GLB 双管线 */}
        <Link to="/stall" className="shop shop--b">
          <span className="shop-halo" aria-hidden="true" />
          <span className="facade-cap" aria-hidden="true" />
          <span className="awning awning--b" aria-hidden="true">
            <span className="awning-beads" />
            <span className="awning-sign">营业中</span>
          </span>
          <span className="shop-no">02</span>
          <Window
            tag="Blender GLB · 双管线"
            ver="建模重制 · 图集 + 实时"
            suffix="· 重制"
            desc="Blender 建模导出的 GLB：机位静帧图集、环景视频，加上网页实时场景——机位预设、落雪与蒸汽。"
          />
          <span className="shop-spill" aria-hidden="true" />
        </Link>
      </section>

      <div className="sidewalk" aria-hidden="true" />

      <footer className="street-foot">
        <span>夜深了，来碗馄饨。</span>
      </footer>
    </main>
  );
}
