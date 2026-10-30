// /sky-city — 天空之城：暮色云海上的浮空城（纯代码三渲二，无 GLB）。
// UI 栏（机位四按钮 + 自动环绕开关）复用 /stall/live 的 live-bar 样式与交互逻辑。
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { initSkyCity } from '../scenes/skyCityScene.js';
import Bgm from '../components/Bgm.jsx';

const CAMS = [
  { id: 'iso',   label: '全景' },
  { id: 'beam',  label: '仰视光柱' },
  { id: 'cloud', label: '平视云海' },
  { id: 'ring',  label: '贴环看城' },
];

export default function SkyCity() {
  const containerRef = useRef(null);
  const ctrlRef = useRef(null);
  const [view, setView] = useState('iso');
  const [orbit, setOrbit] = useState(false);

  useEffect(() => {
    const ctrl = initSkyCity(containerRef.current);
    ctrlRef.current = ctrl;
    return () => { ctrl.dispose(); ctrlRef.current = null; };  // StrictMode 双挂载安全
  }, []);

  const pickView = (id) => {
    setView(id);
    setOrbit(false);          // setView 内部也会退出自动环绕，这里同步 UI 状态
    ctrlRef.current?.setView(id);
  };
  const toggleOrbit = () => {
    const next = !orbit;
    setOrbit(next);
    ctrlRef.current?.setOrbit(next);
  };

  return (
    <div className="scene-page">
      <div ref={containerRef} className="scene-mount" />

      <Link to="/" className="scene-back" aria-label="返回首页">← 万花筒</Link>
      <Bgm storageKey="bgm:sky-city" />

      <nav className="live-bar" aria-label="场景控制">
        <div className="live-cams" role="group" aria-label="机位">
          {CAMS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`live-btn${view === c.id ? ' on' : ''}`}
              onClick={() => pickView(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <span className="live-sep" aria-hidden="true" />
        <button
          type="button"
          className={`live-btn live-toggle${orbit ? ' on' : ''}`}
          aria-pressed={orbit}
          onClick={toggleOrbit}
        >
          自动环绕
        </button>
      </nav>
    </div>
  );
}
