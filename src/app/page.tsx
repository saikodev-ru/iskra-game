'use client'

import { useEffect } from 'react'

export default function Home() {
  useEffect(() => {
    // Prevent double initialization in React strict mode
    if ((window as unknown as Record<string, boolean>).__rhythmOsLoaded) return;
    (window as unknown as Record<string, boolean>).__rhythmOsLoaded = true;

    // Inject import map for Three.js, addons, and fflate
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

    // Load game bootstrap
    const gameScript = document.createElement('script');
    gameScript.type = 'module';
    gameScript.src = '/game/main.js';
    document.body.appendChild(gameScript);
  }, []);

  return (
    <div style={{
      margin: 0,
      overflow: 'hidden',
      background: '#0D1117',
      width: '100vw',
      height: '100vh',
      position: 'relative'
    }}>
      <canvas id="three" style={{ position: 'fixed', top: 0, left: 0, zIndex: 0, pointerEvents: 'none' as const }} />
      <canvas id="game" style={{ position: 'fixed', top: 0, left: 0, zIndex: 1 }} />
      <div id="judgement-overlay" style={{ position: 'fixed', inset: 0, zIndex: 2, pointerEvents: 'none' }} />
      <div id="hud" style={{ position: 'fixed', inset: 0, zIndex: 3, pointerEvents: 'none' }} />
      <div id="screen" style={{ position: 'fixed', inset: 0, zIndex: 5 }} />
      <div id="modal" style={{ position: 'fixed', inset: 0, zIndex: 10, pointerEvents: 'none' }} />
    </div>
  );
}
