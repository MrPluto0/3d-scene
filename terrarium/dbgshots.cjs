// 近距离检视：确认雪山/河流/动物/光束真实渲染情况
const { chromium } = require('/Users/gypsophia/.hermes/hermes-agent/node_modules/playwright');
const OUT = '/Users/gypsophia/Projects/3d-scene/terrarium/screenshots';
const EXE = '/Users/gypsophia/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const ARGS = ['--proxy-server=direct://', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'];

(async () => {
  const errs = [];
  const b = await chromium.launch({ executablePath: EXE, headless: true, args: ARGS });
  const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  await pg.goto('http://127.0.0.1:8743/?mode=day', { waitUntil: 'load' });
  await pg.waitForFunction('window.__TERRARIUM && window.__TERRARIUM.ready', { timeout: 15000 });
  await pg.waitForTimeout(5000);
  console.log('animals:', await pg.evaluate('window.__ANIMALS__'));
  console.log('trees:', await pg.evaluate('window.__TREES__ ?? "?"'));

  // 近观正面（看瀑布/湖/动物）
  await pg.evaluate('window.__TERRARIUM.setCam(0.6, 3.1, 6.4, 0, 2.6, 0)');
  await pg.waitForTimeout(1800);
  await pg.screenshot({ path: OUT + '/dbg-front.png' });
  // 近观山体（从右前上看向雪峰）
  await pg.evaluate('window.__TERRARIUM.setCam(3.4, 4.6, 5.2, -0.6, 3.4, -1.2)');
  await pg.waitForTimeout(1800);
  await pg.screenshot({ path: OUT + '/dbg-mountain.png' });
  // 顶部俯视（看河流走向）
  await pg.evaluate('window.__TERRARIUM.setCam(2.0, 8.0, 4.0, 0, 2.55, 0)');
  await pg.waitForTimeout(1800);
  await pg.screenshot({ path: OUT + '/dbg-top.png' });

  console.log('errors:', errs.join(' | ') || 'none');
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
