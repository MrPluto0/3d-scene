// 验证脚本：day/dusk/night 三态截图 + pageerror 收集
const { chromium } = require('/Users/gypsophia/.hermes/hermes-agent/node_modules/playwright');
const OUT = '/Users/gypsophia/Projects/3d-scene/terrarium/screenshots';
const URL = process.argv[2] || 'http://127.0.0.1:8743/';

(async () => {
  const b = await chromium.launch({
    executablePath: '/Users/gypsophia/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    headless: true,
    args: ['--proxy-server=direct://', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
  });
  const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  for (const mode of ['day', 'dusk', 'night']) {
    await pg.goto(URL + '?mode=' + mode, { waitUntil: 'load' });
    // 等 ready 标志，最多 5s
    await pg.waitForFunction('window.__TERRARIUM && window.__TERRARIUM.ready === true', { timeout: 8000 }).catch(() => errs.push('READY_TIMEOUT:' + mode));
    await pg.waitForTimeout(4500); // 光照过渡（SwiftShader 低帧率，收敛慢）
    await pg.screenshot({ path: `${OUT}/check-${mode}.png` });
    console.log('shot:', mode, JSON.stringify(await pg.evaluate('window.__DBG && window.__DBG()')));
  }
  console.log('errors:', errs.join(' | ') || 'none');
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
