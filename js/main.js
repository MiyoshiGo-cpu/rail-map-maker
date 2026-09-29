// 起動：言語の設定、保存領域の保護の要求、画面の切り替え（#/ 一覧、#/p/{id} エディタ）
import { initUiLang, t } from './i18n/i18n.js';
import { requestPersist } from './storage/idb.js';
import { createProjectList } from './ui/project-list.js';
import { createEditor } from './ui/editor.js';
import { replaceChildren } from './ui/dom.js';

const app = /** @type {HTMLElement} */ (document.getElementById('app'));

initUiLang();
document.title = t('app.title');
requestPersist();

// Safari のピンチによるページ全体の拡大を止める（キャンバスの操作は自前で扱う）。
// 何かの拍子に拡大されてしまったときは止めず、2本指で元の大きさに戻せるようにする。
const vv = window.visualViewport;
const pageZoomed = () => !!vv && vv.scale > 1.01;
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(ev, (e) => {
    if (!pageZoomed()) e.preventDefault();
  }, { passive: false });
}
document.addEventListener('touchmove', (e) => {
  if (e.touches.length > 1 && !pageZoomed()) e.preventDefault();
}, { passive: false });
if (vv) {
  // 拡大中はキャンバスでもページのピンチを通す（css の .page-zoomed）
  vv.addEventListener('resize', () => {
    document.documentElement.classList.toggle('page-zoomed', pageZoomed());
  });
}

// ホーム画面から起動したときは、アドレスバーが無いので実際の高さを --app-h に入れて使う（css の #app など）。
// iPhone では 100dvh も clientHeight も時計の表示の分だけ短く伝えられ、下に隙間ができるため、
// 画面の幅いっぱいに開いていて差が小さいときは、画面そのものの高さを使う
const iosStandalone = /** @type {any} */ (navigator).standalone === true;
const standalone = matchMedia('(display-mode: standalone)').matches || iosStandalone;
if (standalone) {
  const setAppHeight = () => {
    let h = document.documentElement.clientHeight;
    if (iosStandalone) {
      const landscape = innerWidth > innerHeight;
      const long = Math.max(screen.width, screen.height);
      const short = Math.min(screen.width, screen.height);
      const sw = landscape ? long : short;
      const sh = landscape ? short : long;
      if (Math.abs(innerWidth - sw) <= 1 && sh > h && sh - h <= 100) h = sh;
    }
    document.documentElement.style.setProperty('--app-h', `${h}px`);
  };
  // アプリは画面に固定する（css の .is-standalone #app）。ページが画面より高いとスクロールできる扱いになり、
  // iPhone が上端に時計の表示の分の余白をもう一度足してしまうため
  document.documentElement.classList.add('is-standalone');
  setAppHeight();
  addEventListener('resize', setAppHeight);
  addEventListener('orientationchange', () => setTimeout(setAppHeight, 300));
}

// 一時的：ホーム画面から起動した iPhone の高さの確認用（確認が済んだら消す）
if (iosStandalone) {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:8px;top:45%;z-index:9999;background:rgba(0,0,0,.72);color:#fff;'
    + 'font:12px/1.4 ui-monospace,monospace;padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre';
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:env(safe-area-inset-top);visibility:hidden';
  document.body.append(box, probe);
  const update = () => {
    const r = app.getBoundingClientRect();
    box.textContent = [
      `screen ${screen.width}x${screen.height}`,
      `inner ${innerWidth}x${innerHeight}`,
      `client ${document.documentElement.clientHeight}`,
      `vv ${vv ? `${Math.round(vv.height)} @${Math.round(vv.offsetTop)}` : '-'}`,
      `safeT ${probe.offsetHeight}`,
      `appH ${getComputedStyle(document.documentElement).getPropertyValue('--app-h')}`,
      `app ${Math.round(r.top)}..${Math.round(r.bottom)}`,
      `head ${(() => {
        const hd = document.querySelector('.ed-header, .plist-header');
        if (!hd) return '-';
        const b = hd.getBoundingClientRect();
        return `${Math.round(b.top)}..${Math.round(b.bottom)}`;
      })()}`,
      `scroll ${scrollY}/${document.documentElement.scrollHeight}`,
    ].join('\n');
  };
  update();
  setInterval(update, 1000);
}

/** @type {{ dispose: () => any } | null} */
let current = null;
let routing = Promise.resolve();

function parseRoute() {
  const m = location.hash.match(/^#\/p\/([\w-]+)/);
  return m ? { name: 'editor', id: m[1] } : { name: 'list' };
}

async function route() {
  const r = parseRoute();
  if (current) {
    const prev = current;
    current = null;
    await prev.dispose();
  }
  if (r.name === 'editor') {
    const editor = createEditor({ projectId: r.id, onExit: () => go('#/') });
    current = editor;
    replaceChildren(app, editor.el);
  } else {
    const list = createProjectList({ onOpen: (id) => go(`#/p/${id}`) });
    current = list;
    replaceChildren(app, list.el);
  }
}

/** @param {string} hash */
function go(hash) {
  if (location.hash === hash) return;
  location.hash = hash;
}

window.addEventListener('hashchange', () => {
  routing = routing.then(route, route);
});
routing = route();
