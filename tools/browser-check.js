// ブラウザでの確認（クラウドなど、画面を直接見られない環境向け）。
// 入っている Chromium を画面なしで起動し、ページを開いて、画面写真とコンソールのエラーを確かめる。
// 外部のパッケージは使わず、Chrome DevTools Protocol（Node の WebSocket）で操作する。
//
// 使い方（先にローカルサーバー tools/serve.py を起動しておく）
//   node tools/browser-check.js tests
//       … tests/index.html を開き、成功・失敗の数と失敗したテストを表示する
//   node tools/browser-check.js shot [パス] [--sizes=390x844,1280x800] [--script=手順.js] [--out=フォルダ] [--wait=800]
//       … ページを開いて（手順があれば実行して）画面写真を撮る。コンソールのエラーがあれば表示して終了コード1
//   共通：--base=http://localhost:8000/ （URL の頭）
// 手順のファイルは、ページの中で async 関数の本体として実行する（例：await rmmDebug...）。
// Chromium の場所は環境変数 CHROMIUM か /opt/pw-browsers/chromium。
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const opts = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => {
  const [k, ...v] = a.slice(2).split('=');
  return [k, v.join('=') || 'true'];
}));
const [mode = 'shot', path = ''] = args.filter((a) => !a.startsWith('--'));
const BASE = opts.base || 'http://localhost:8000/';
const CHROMIUM = process.env.CHROMIUM || '/opt/pw-browsers/chromium';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Chromium を起動し、DevTools の接続先を返す */
async function launch() {
  const profile = mkdtempSync(join(tmpdir(), 'rmm-chromium-'));
  const proc = spawn(CHROMIUM, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--no-proxy-server',
    '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((res, rej) => {
    let buf = '';
    const timer = setTimeout(() => rej(new Error('Chromium が起動しませんでした')), 15000);
    proc.stderr.on('data', (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) {
        clearTimeout(timer);
        res(m[1]);
      }
    });
    proc.on('exit', () => rej(new Error('Chromium が終了しました：' + buf.slice(-500))));
  });
  const port = new URL(wsUrl).port;
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((x) => x.type === 'page');
  return {
    pageWs: page.webSocketDebuggerUrl,
    close() {
      proc.kill();
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        // 消せなくても続ける
      }
    },
  };
}

/** DevTools Protocol の小さな接続 */
async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  const handlers = new Map();
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(String(e.data));
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(msg.error.message));
      else res(msg.result);
    } else if (msg.method) {
      for (const fn of handlers.get(msg.method) || []) fn(msg.params);
    }
  });
  return {
    send(method, params = {}) {
      const id = ++seq;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((res, rej) => pending.set(id, { res, rej }));
    },
    on(method, fn) {
      if (!handlers.has(method)) handlers.set(method, []);
      handlers.get(method).push(fn);
    },
    close: () => ws.close(),
  };
}

/** ページの式を評価して値を返す */
async function evaluate(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

/** コンソールのエラー・例外・読み込みの失敗を集める */
function collectErrors(cdp) {
  const errors = [];
  cdp.on('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error' || p.type === 'assert') errors.push('console.' + p.type + ': ' + p.args.map((a) => a.value ?? a.description ?? '').join(' '));
  });
  cdp.on('Runtime.exceptionThrown', (p) => errors.push('exception: ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text)));
  cdp.on('Log.entryAdded', (p) => {
    // favicon.ico はテストのページが持たないので対象外
    if (p.entry.level === 'error' && !/favicon\.ico/.test(p.entry.url || '')) errors.push('log: ' + p.entry.text + (p.entry.url ? ' ' + p.entry.url : ''));
  });
  return errors;
}

async function open(cdp, url, width, height) {
  const mobile = width < 900;
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await cdp.send('Emulation.setTouchEmulationEnabled', mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  const loaded = new Promise((res) => cdp.on('Page.loadEventFired', res));
  await cdp.send('Page.navigate', { url });
  await Promise.race([loaded, sleep(10000)]);
}

async function runTests(cdp) {
  await open(cdp, new URL('tests/', BASE).href, 1280, 800);
  for (let i = 0; i < 120; i++) {
    const s = await evaluate(cdp, "document.getElementById('summary')?.className || ''");
    if (s === 'ok' || s === 'ng') break;
    await sleep(250);
  }
  const summary = await evaluate(cdp, "document.getElementById('summary').textContent");
  const failed = await evaluate(cdp, "[...document.querySelectorAll('li.ng')].map((li) => li.textContent)");
  console.log('ブラウザのテスト：' + summary);
  for (const f of failed) console.log('  ' + f);
  return failed.length === 0 && !/実行中/.test(summary);
}

async function runShots(cdp, errors) {
  const sizes = (opts.sizes || '390x844,1280x800').split(',').map((s) => s.split('x').map(Number));
  const outDir = resolve(opts.out || join(tmpdir(), 'rmm-shots'));
  mkdirSync(outDir, { recursive: true });
  const script = opts.script ? readFileSync(resolve(opts.script), 'utf8') : '';
  const wait = Number(opts.wait || 800);
  for (const [w, hgt] of sizes) {
    await open(cdp, new URL(path, BASE).href, w, hgt);
    await sleep(wait);
    if (script) {
      const v = await evaluate(cdp, `(async () => {\n${script}\n})()`);
      if (v !== undefined) console.log(`[${w}x${hgt}] 手順の結果：`, typeof v === 'string' ? v : JSON.stringify(v));
      await sleep(wait);
    }
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const file = join(outDir, `shot-${w}x${hgt}.png`);
    writeFileSync(file, Buffer.from(shot.data, 'base64'));
    console.log('画面写真：' + file);
  }
  return errors.length === 0;
}

const browser = await launch();
let ok = false;
try {
  const cdp = await connect(browser.pageWs);
  const errors = collectErrors(cdp);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  ok = mode === 'tests' ? await runTests(cdp) : await runShots(cdp, errors);
  // テストのページは、失敗の扱いを確かめるためにわざとエラーを出すテストがあるので、参考として表示するだけにする
  const label = mode === 'tests' ? '（参考）' : '';
  console.log(errors.length ? `コンソールのエラー${label} ${errors.length}件：` : 'コンソールのエラー 0件');
  for (const e of errors) console.log('  ' + e);
  if (errors.length && mode !== 'tests') ok = false;
  cdp.close();
} catch (e) {
  console.error(e);
} finally {
  browser.close();
}
process.exit(ok ? 0 : 1);
