import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { initWontonMini } from '../scenes/wontonMiniScene.js';

export default function WontonMini() {
  const containerRef = useRef(null);

  useEffect(() => {
    const cleanup = initWontonMini(containerRef.current);
    return cleanup; // cancels RAF, disposes GPU resources, unbinds events
  }, []);

  return (
    <div className="scene-page">
      <div ref={containerRef} className="scene-mount" />
      <Link to="/" className="scene-back" aria-label="返回首页">← 万花筒</Link>
    </div>
  );
}
