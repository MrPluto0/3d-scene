// <Bgm storageKey="bgm:xxx" /> — 场景页右下角极简 BGM 按钮 + 自动淡入播放。
// - 自动播放合规：初始不播；首次用户 pointerdown（含首次拖拽）后 play()，2s 淡入到 0.35，loop。
// - localStorage 记忆：用户点按钮静音过（'muted'）就不再自动播；点恢复写回 'on'。
// - 卸载（路由切换）时 0.5s 淡出后 pause 并释放资源；audio 用 new Audio() 不挂 DOM，
//   所以淡出可以在组件卸载后继续完成（模块内 RAF 驱动）。
import { useEffect, useRef, useState } from 'react';

const SRC = '/audio/bgm.m4a';
const VOL = 0.35;
const FADE_IN_MS = 2000;
const FADE_OUT_MS = 500;

export default function Bgm({ storageKey }) {
  const toggleRef = useRef(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const audio = new Audio(SRC);
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0;
    window.__bgm = audio; // 调试/测试句柄（同 viewer.html 的 window.__three 约定）

    let dead = false;
    let raf = 0;
    let userMuted = localStorage.getItem(storageKey) === 'muted';

    const fadeTo = (target, dur, done) => {
      cancelAnimationFrame(raf);
      const v0 = audio.volume;
      const t0 = performance.now();
      const step = (now) => {
        if (dead) return;
        const k = Math.min(1, (now - t0) / dur);
        audio.volume = Math.min(1, Math.max(0, v0 + (target - v0) * k));
        if (k < 1) raf = requestAnimationFrame(step);
        else if (done) done();
      };
      raf = requestAnimationFrame(step);
    };

    const play = () => {
      audio.volume = 0;
      audio.play().then(() => fadeTo(VOL, FADE_IN_MS)).catch(() => {});
    };
    const pause = () => fadeTo(0, FADE_OUT_MS, () => audio.pause());

    // 首次用户交互（pointerdown，拖拽也以 pointerdown 开头）后自动淡入；
    // 点 BGM 按钮本身不算「场景交互」，交给按钮自己的 click 逻辑。
    const onGesture = (e) => {
      if (e.target && e.target.closest && e.target.closest('.bgm-btn')) return;
      if (userMuted) { window.removeEventListener('pointerdown', onGesture, true); return; }
      window.removeEventListener('pointerdown', onGesture, true);
      play();
    };
    if (!userMuted) window.addEventListener('pointerdown', onGesture, true);

    toggleRef.current = () => {
      if (audio.paused) {
        userMuted = false;
        localStorage.setItem(storageKey, 'on');
        play();
      } else {
        userMuted = true;
        localStorage.setItem(storageKey, 'muted');
        pause();
      }
    };

    const setOnState = () => setOn(!audio.paused);
    audio.addEventListener('play', setOnState);
    audio.addEventListener('pause', setOnState);

    return () => {
      dead = true;
      if (window.__bgm === audio) delete window.__bgm;
      window.removeEventListener('pointerdown', onGesture, true);
      cancelAnimationFrame(raf);
      audio.removeEventListener('play', setOnState);
      audio.removeEventListener('pause', setOnState);
      toggleRef.current = null;
      // 淡出后清理：audio 不在 DOM 里，卸载后仍可短暂存活完成淡出
      const v0 = audio.volume;
      const t0 = performance.now();
      const fade = (now) => {
        const k = Math.min(1, (now - t0) / FADE_OUT_MS);
        audio.volume = v0 * (1 - k);
        if (k < 1) requestAnimationFrame(fade);
        else { audio.pause(); audio.removeAttribute('src'); audio.load(); }
      };
      requestAnimationFrame(fade);
    };
  }, [storageKey]);

  return (
    <button
      type="button"
      className={`bgm-btn${on ? '' : ' is-off'}`}
      aria-pressed={on}
      aria-label="BGM 开关（We Never — ZHENLOE）"
      data-bgm={on ? 'on' : 'off'}
      onClick={() => toggleRef.current?.()}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
        {!on && <line x1="3" y1="3" x2="21" y2="21" />}
      </svg>
    </button>
  );
}
