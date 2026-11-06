// V2 交付截图：白昼/黄昏/夜晚主视角 + 1920x1440 大图
const { chromium } = require('/Users/gypsophia/.hermes/hermes-agent/node_modules/playwright');
const OUT = '/Users/gypsophia/Projects/3d-scene/terrarium/screenshots';
const EXE = '/Users/gypsophia/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const ARGS = ['--proxy-server=direct://', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'];

async function settle(pg, mode, az) {
  await pg.goto('http://127.0.0.1:8743/?mode=' + mode, { waitUntil: 'load' });
  await pg.waitForFunction('window.__TERRARIUM && window.__TERRARIUM.ready', { timeout: 15000 });
  await pg.waitForTimeout(6500);
  if (az !== undefined) {
    await pg.evaluate(a => window.__TERRARIUM.setView(a), az);
    await pg.waitForTimeout(1800);
  }
}

(async () => {
  const errs = [];
  const b = await chromium.launch({ executablePath: EXE, headless: true, args: ARGS });

  const pg = await b.newPage({ viewport: { width: 1600, height: 900 } });
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  await settle(pg, 'day');
  await pg.screenshot({ path: OUT + '/v2-day.png' });
  console.log('day', JSON.stringify(await pg.evaluate('window.__DBG && window.__DBG()')));
  await settle(pg, 'dusk');
  await pg.screenshot({ path: OUT + '/v2-dusk.png' });
  console.log('dusk', JSON.stringify(await pg.evaluate('window.__DBG && window.__DBG()')));
  await settle(pg, 'night');
  await pg.screenshot({ path: OUT + '/v2-night.png' });
  console.log('night', JSON.stringify(await pg.evaluate('window.__DBG && window.__DBG()')));
  await pg.close();

  const big = await b.newPage({ viewport: { width: 1920, height: 1440 } });
  big.on('pageerror', e => errs.push('BIG:' + e.message));
  big.on('console', m => { if (m.type() === 'error') errs.push('BIG:' + m.text()); });
  await settle(big, 'day');
  await big.screenshot({ path: OUT + '/v2-main-1920x1440.png' });
  await big.close();

  console.log('errors:', errs.join(' | ') || 'none');
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
