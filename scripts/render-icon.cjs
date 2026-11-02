// Renders the app icon with the game's own organism renderer.
// Usage: npm run dev (port 5173), then: node scripts/render-icon.cjs design/icon-1024.png
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:5173/'); await page.waitForTimeout(2000);
  const variant = process.argv[3] || 'a';
  const data = await page.evaluate(async (variant) => {
    const { drawOrganism } = await import('/src/render/organismDraw.ts');
    const { drawGlow } = await import('/src/render/sprites.ts');
    const { baseLook } = await import('/src/render/look.ts');
    const S = 1024;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const ctx = c.getContext('2d');
    // deep sea background
    const bg = ctx.createRadialGradient(S * 0.45, S * 0.32, S * 0.05, S * 0.5, S * 0.55, S * 0.85);
    bg.addColorStop(0, '#0f6a7e'); bg.addColorStop(0.45, '#073449'); bg.addColorStop(1, '#020c16');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S);
    // light shafts
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const x = S * (0.12 + i * 0.3);
      const g = ctx.createLinearGradient(0, 0, 0, S);
      g.addColorStop(0, 'rgba(190,255,240,0.10)'); g.addColorStop(1, 'rgba(190,255,240,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + S * 0.1, 0); ctx.lineTo(x + S * 0.32, S); ctx.lineTo(x + S * 0.18, S); ctx.closePath(); ctx.fill();
    }
    // nutrient motes
    const motes = [[0.2,0.22,10],[0.8,0.2,8],[0.86,0.62,12],[0.16,0.74,9],[0.7,0.86,7],[0.32,0.9,6],[0.9,0.4,5],[0.1,0.45,6]];
    for (const [x,y,r] of motes) { drawGlow(ctx, '#8cffe6', x*S, y*S, r*5, 0.55); }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(232,255,249,0.9)';
    for (const [x,y,r] of motes) { ctx.beginPath(); ctx.arc(x*S, y*S, r*0.9, 0, Math.PI*2); ctx.fill(); }
    // a small companion cell for scale and life
    const prey = baseLook({ body: 'rod', membrane: '#9ff7ff', inner: '#2a8fb0', glow: '#57d9ff', nucleoid: true });
    drawOrganism(ctx, prey, S * 0.2, S * 0.8, S * 0.045, { seed: 3, t: 1, speed: 0.2, angle: -0.9, detail: 1, glowScale: 0.8 });
    // hero protocell
    const look = baseLook({ membrane: '#a6fff2', inner: '#0f6f7c', glow: '#3fe0c5', nucleus: '#ffe3a8', cilia: 0.6, chloro: 3, mito: 2, vesicles: 4, vesicleColor: '#ffd27a', wobble: 0.045, glowStrength: 1.8 });
    drawOrganism(ctx, look, S * 0.52, S * 0.5, S * 0.3, { seed: 5.3, t: 3.1, speed: 0.1, angle: -0.35, detail: 1, glowScale: 0.75 });
    return c.toDataURL('image/png');
  }, variant);
  require('fs').writeFileSync(process.argv[2], Buffer.from(data.split(',')[1], 'base64'));
  await b.close();
})();
