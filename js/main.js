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
