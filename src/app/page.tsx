'use client'

import { useEffect } from 'react'

export default function Home() {
  useEffect(() => {
    if ((window as unknown as Record<string, boolean>).__rhythmOsLoaded) return;
    (window as unknown as Record<string, boolean>).__rhythmOsLoaded = true;

    const importMap = document.createElement('script');
    importMap.type = 'importmap';
    importMap.textContent = JSON.stringify({
      imports: {
        "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
        "three/": "https://cdn.jsdelivr.net/npm/three@0.170.0/",
        "fflate": "https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js"
      }
    });
    document.head.appendChild(importMap);

    const gameScript = document.createElement('script');
    gameScript.type = 'module';
    gameScript.src = '/game/main.js';
    document.body.appendChild(gameScript);
  }, []);

  return (
    <div style={{ margin: 0, overflow: 'hidden', background: '#111111', width: '100vw', height: '100vh', position: 'relative' }}>
      {/* 3D scene — bottom layer, always visible */}
      <canvas id="three" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }} />
      {/* Game canvas — transparent background, notes only */}
      <canvas id="game" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1 }} />
      {/* Judgement overlay */}
      <div id="judgement-overlay" style={{ position: 'fixed', inset: 0, zIndex: 2, pointerEvents: 'none' }} />
      {/* HUD */}
      <div id="hud" style={{ position: 'fixed', inset: 0, zIndex: 3, pointerEvents: 'none' }} />
      {/* Screen UI — transparent so 3D shows through; each screen handles its own background */}
      <div id="screen" style={{ position: 'fixed', inset: 0, zIndex: 5 }} />
      {/* Modal */}
      <div id="modal" style={{ position: 'fixed', inset: 0, zIndex: 10, pointerEvents: 'none' }} />
    </div>
  );
}
