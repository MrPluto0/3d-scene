// /stall/live — 雪夜馄饨摊实时渲染页：全屏挂 wontonStallScene，
// UI 栏（机位四按钮 + 自动环绕 + 落雪开关）用 React state 驱动控制器。
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import glbUrl from '../assets/wonton-stall.glb?url';   // ?url：让 Vite 把 GLB 当静态资产输出 hash 文件
import { initStallScene } from '../scenes/wontonStallScene.js';
import Bgm from '../components/Bgm.jsx';

const CAMS = [
  { id: 'iso', label: '全景' },
  { id: 'table', label: '桌前' },
  { id: 'street', label: '街对面' },
  { id: 'shoulder', label: '过肩' },
];

export default function StallLive() {
  const containerRef = useRef(null);
  const ctrlRef = useRef(null);
  const [view, setView] = useState('iso');
  const [orbit, setOrbit] = useState(false);
  const [snow, setSnow] = useState(true);
  const [phase, setPhase] = useState('loading');   // loading | ready | error
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    const ctrl = initStallScene(containerRef.current, {
      glbUrl,
      onReady: () => setPhase('ready'),
      onError: (msg) => { setErrMsg(msg); setPhase('error'); },
    });
    ctrlRef.current = ctrl;
    return () => { ctrl.dispose(); ctrlRef.current = null; };  // StrictMode 双挂载安全
  }, []);

  const pickView = (id) => {
    setView(id);
    setOrbit(false);          // 控制器 setView 内部也会退出自动环绕，这里同步 UI 状态
    ctrlRef.current?.setView(id);
  };
  const toggleOrbit = () => {
    const next = !orbit;
    setOrbit(next);
    ctrlRef.current?.setOrbit(next);
  };
  const toggleSnow = () => {
    const next = !snow;
    setSnow(next);
    ctrlRef.current?.setSnow(next);
  };

  return (
    <div className="scene-page" data-live-phase={phase}>
      <div ref={containerRef} className="scene-mount" />

      <Link to="/stall" className="scene-back" aria-label="返回图集">← 馄饨摊图集</Link>
      <Bgm storageKey="bgm:stall-live" />

      {phase === 'loading' && (
        <div className="live-load" aria-live="polite">
          <p className="live-load-title">雪 夜 馄 饨 摊</p>
          <p className="live-load-sub">正在生火、下雪……</p>
        </div>
      )}
      {phase === 'error' && (
        <div className="live-load live-err" role="alert">
          <p className="live-load-title">出问题了</p>
          <p className="live-load-sub">{errMsg}</p>
          <Link to="/stall" className="live-err-back">← 回图集页</Link>
        </div>
      )}

      {phase === 'ready' && (
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
          <button
            type="button"
            className={`live-btn live-toggle${snow ? ' on' : ''}`}
            aria-pressed={snow}
            onClick={toggleSnow}
          >
            落雪
          </button>
        </nav>
      )}
    </div>
  );
}
