// 地形ブラシのツール（§6.7・地理ビューだけ）：1本指（マウス）のドラッグで塗り、離したら1回のなぞりとして記録する（1手で取り消せる）。
// 2本指になったら塗るのをやめて地図を動かす（gestures.js が cancel を呼ぶ）。タップは1か所だけ塗る。
// 「都市を置く」は、空いた陸のタップで都市を置き、都市のタップでその都市を選ぶ（ドラッグは地図を動かす）。
// 記録したなぞりは、地形を作り直し終えるまで下書きとして描き続ける（作り直しは Worker で少し時間がかかるため）。
import { t } from '../../i18n/i18n.js';
import { GEO_UNIT } from '../../core/viewport.js';
import { newCityAt } from '../../core/terrain/world.js';
import { getRegion } from '../../core/regions/index.js';

/** 塗っている途中の点を足す間隔（ブラシの半径に対する割合と、最小の km） */
const STEP_RATIO = 0.2;
const MIN_STEP_KM = 0.05;

const round2 = (v) => Math.round(v * 100) / 100 + 0;

/**
 * @param {any} ed 地理用の道具（geo-view.js の gctx）。getBase は地形の下ごしらえ、requestRender は描き直し
 */
export function createBrushTool(ed) {
  const { store, es } = ed;
  /** @type {import('../../core/terrain/brush.js').BrushStroke | null} 塗っている途中 */
  let current = null;
  /** @type {import('../../core/terrain/brush.js').BrushStroke[]} 記録して、地形の作り直しを待っているなぞり */
  const pending = [];
  /** @type {{ x: number, y: number } | null} マウスの位置（世界座標） */
  let hover = null;

  const settings = () => es.get().brush;
  const toKm = (w) => [round2(w.x / GEO_UNIT), round2(w.y / GEO_UNIT)];

  function startStroke(w) {
    const b = settings();
    return { tool: /** @type {any} */ (b.tool), r: b.size, s: b.strength, pts: toKm(w) };
  }

  function commit(stroke) {
    pending.push(stroke);
    store.dispatch({ type: 'world/brush', stroke });
    ed.requestRender();
  }

  /** 都市を置く（都市の上なら、その都市を選ぶ） */
  function placeCity(p, w) {
    const hit = ed.hitTest(p, w, (tg) => tg.type === 'city');
    if (hit) {
      ed.select({ type: 'city', id: hit.id });
      return;
    }
    const prj = store.getState();
    const world = prj.world;
    const base = ed.getBase();
    if (world.mode !== 'fictional' || !base) return;
    const g = { x: w.x / GEO_UNIT, y: w.y / GEO_UNIT };
    const cx = Math.floor(g.x / base.cellKm);
    const cy = Math.floor(g.y / base.cellKm);
    // 地形の外と、水の上には置かない
    if (cx < 0 || cy < 0 || cx >= base.width || cy >= base.height || base.water[cy * base.width + cx] !== 0) {
      ed.toast(t('brush.cityOnLand'));
      return;
    }
    const city = newCityAt(world, base, g, getRegion(prj.locale.region), prj.settings.romaji);
    const id = store.dispatch({ type: 'world/cityAdd', city });
    ed.select({ type: 'city', id });
    ed.toast(t('brush.cityAdded', { name: city.name }));
  }

  return {
    id: 'brush',
    cursor: 'crosshair',
    /** @param {any} p @param {{ x: number, y: number }} w */
    onTap(p, w) {
      if (settings().tool === 'city') {
        placeCity(p, w);
        return;
      }
      commit(startStroke(w));
    },
    /** @param {any} p @param {{ x: number, y: number }} w */
    onDragStart(p, w) {
      if (settings().tool === 'city') return null;
      current = startStroke(w);
      const step = Math.max(MIN_STEP_KM, current.r * STEP_RATIO);
      ed.requestRender();
      const addPoint = (v, force) => {
        if (!current) return;
        const [x, y] = toKm(v);
        const n = current.pts.length;
        if (force ? x === current.pts[n - 2] && y === current.pts[n - 1] : Math.hypot(x - current.pts[n - 2], y - current.pts[n - 1]) < step) return;
        current.pts.push(x, y);
      };
      return {
        move(q) {
          const v = ed.toWorld(q);
          hover = v;
          addPoint(v, false);
          ed.requestRender();
        },
        end(q) {
          addPoint(ed.toWorld(q), true);
          const s = current;
          current = null;
          if (s) commit(s);
        },
        cancel() {
          current = null;
          ed.requestRender();
        },
      };
    },
    /** @param {any} p @param {{ x: number, y: number }} w */
    onHover(p, w) {
      hover = w;
      ed.requestRender();
    },
    /** 下書き：記録して地形を待っているなぞりと塗っている途中のなぞり、マウスの位置 */
    preview() {
      return { strokes: current ? [...pending, current] : pending, hover, brush: settings() };
    },
    /** 地形を作り直し終えたとき（下書きを消す） */
    baseUpdated() {
      pending.length = 0;
    },
    /** マウスが地図の外に出たとき */
    leave() {
      hover = null;
      ed.requestRender();
    },
  };
}
