'use client'

import { useEffect } from 'react'

export default function Home() {
  useEffect(() => {
    // Robust HMR guard — dispose old game if it exists
    if ((window as unknown as Record<string, any>).__rhythmOsLoaded) {
      // Check if the old instance has a dispose method
      const old = (window as unknown as Record<string, any>).__rhythmOsLoaded;
      if (typeof old.dispose === 'function') {
        try { old.dispose(); } catch (_) {}
      }
      // If already loaded and no dispose, skip
      if (old === true) return;
    }

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

    // Mark as loaded (simple boolean — can't easily pass dispose across module boundaries)
    (window as unknown as Record<string, boolean>).__rhythmOsLoaded = true;
  }, []);

  return (
    <div style={{ margin: 0, overflow: 'hidden', background: '#000000', width: '100vw', height: '100vh', position: 'relative' }}>
      <canvas id="three" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }} />
      <canvas id="game" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1 }} />
      <div id="judgement-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 2, pointerEvents: 'none', overflow: 'hidden' }} />
      <div id="hud" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 3, pointerEvents: 'none', overflow: 'hidden' }} />
      <div id="screen" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 5, overflow: 'hidden' }} />
      <div id="modal" style={{ position: 'fixed', inset: 0, zIndex: 10, pointerEvents: 'none' }} />
    </div>
  );
}
