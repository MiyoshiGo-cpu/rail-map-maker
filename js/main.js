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
  setAppHeight();
  addEventListener('resize', setAppHeight);
  addEventListener('orientationchange', () => setTimeout(setAppHeight, 300));
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
