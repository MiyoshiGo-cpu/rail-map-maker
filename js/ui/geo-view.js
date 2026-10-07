// 地理ビュー（§5.4）：架空の地形（段彩と陰影の画像）の上に、県境・川・都市・線路・駅・駅名を描き、地理の位置で編集する。
// 地形の画像・川・県境は、保存した世界から Worker で作り直し（terrain-client.js の analyze）、画像は1回だけ canvas に描いて拡大縮小する。
// 表示リストは倍率の段階が変わったときに作り直す（線の太さと文字の大きさを画面で一定にするため）。
// ツールは路線図と同じもの（駅を置く・路線を引く・削除）に、当たり判定と座標を地理用に差し替えた道具を渡す。選択ツールは地理用。
import { h } from './dom.js';
import { icon } from './icons.js';
import { t, mapTranslator } from '../i18n/i18n.js';
import { createCanvasView } from './canvas-view.js';
import { requestTerrain } from './terrain-client.js';
import { computeGeoSections } from '../core/geo-lines.js';
import { buildGeoScene, geoBaseVectors, geoZoomLevel } from '../render/scene-geo.js';
import { drawItems, createMeasure } from '../render/backend-canvas.js';
import { visibleWorldRect, screenToWorld, GEO_UNIT, GEO_ZOOM } from '../core/viewport.js';
import { drawUnderlay, drawSelectionRings, stationRing } from './overlay.js';
import { makeImage, ringsPath, drawTerrain, drawScaleBar, drawNorthArrow, drawGeoEditOverlay } from './geo-overlay.js';
import { accentFor } from './editor-state.js';
import { pickPending, pendingHint } from './pending-pick.js';
import { createGeoSelectTool } from './tools/geo-select-tool.js';
import { createPlaceStationTool } from './tools/place-station-tool.js';
import { createDrawLineTool } from './tools/draw-line-tool.js';
import { createDeleteTool } from './tools/delete-tool.js';

/** 当たり判定の半径（画面の px。§4.4） */
const HIT_RADIUS = { touch: 22, mouse: 8, pen: 12 };
/** 地形の外の色 */
const OUTSIDE = '#D5DDE5';

/**
 * @param {{
 *   store: any,
 *   es: any,
 *   toolCtx: import('./editor.js').ToolContext,
 *   getInsets?: () => { top: number, right: number, bottom: number, left: number },
 * }} ctx
 */
export function createGeoView(ctx) {
  const { store, es } = ctx;
  const measure = createMeasure();
  /** 地形の下ごしらえ（jobs.js の GeoBase）と、そこから作ったもの */
  let base = null;
  let vectors = null;
  /** 地形の画像（陸・海）と、海岸線・湖岸の形（世界座標） */
  /** @type {{ land: HTMLCanvasElement, sea: HTMLCanvasElement, landPath: Path2D, lakePath: Path2D } | null} */
  let terrain = null;
  /** 下ごしらえを頼んだ世界（標高・パラメータ・県が同じなら作り直さない） */
  let baseKey = null;
  let failed = false;
  let sectionsKey = null;
  let sections = null;
  let sceneKey = null;
  let scene = null;

  const canvasView = createCanvasView({
    label: t('views.geo'),
    getStyle: () => ({ background: OUTSIDE, showGrid: false }),
    initialView: store.getState().view.geo,
    onViewChange: (v) => {
      const cur = store.getCommittedState().view.geo;
      if (cur.cx === v.cx && cur.cy === v.cy && cur.zoom === v.zoom) return;
      store.dispatch({ type: 'project/view', view: 'geo', state: v, silent: true });
    },
    // 全体表示は地形の全体
    getBounds: () => worldExtent(store.getState()),
    getInsets: ctx.getInsets,
    zoomLimits: GEO_ZOOM,
    fitMaxZoom: GEO_ZOOM.max,
  });
  const el = h('div', { class: 'geo-view' }, canvasView.el);

  // スマホの「範囲」ボタン（選択ツールのときだけ出す）
  const rangeBtn = h('button', {
    class: 'icon-btn mobile-only',
    type: 'button',
    'aria-label': t('range.toggle'),
    title: t('range.toggle'),
    'aria-pressed': 'false',
    on: { click: () => es.set({ rangeMode: !es.get().rangeMode }) },
  }, icon('range'));
  canvasView.addControl(rangeBtn);

  // ---------- ツール ----------
  /** 地理用の道具：当たり判定・座標の変換・新しい駅の位置を地理用に差し替える */
  const gctx = {
    ...ctx.toolCtx,
    getScene: () => getScene(),
    hitRadius: (p) => (HIT_RADIUS[p.pointerType] ?? 8) / canvasView.getView().zoom,
    hitTest: (p, w, filter) => getScene().index.hitTest(w.x, w.y, gctx.hitRadius(p), filter),
    toWorld: (p) => screenToWorld(canvasView.getView(), canvasView.getSize(), p.x, p.y),
    openMenuAt: (p, items) => ctx.toolCtx.openMenuAt(p, items, canvasView.canvas),
    // 地理には格子が無いので、駅は当たり判定だけで探す。新しい駅はタップした地理の位置（km）に作る
    stationAt: () => null,
    spotAt: (w) => {
      const g = { x: Math.round(w.x / GEO_UNIT * 1000) / 1000 + 0, y: Math.round(w.y / GEO_UNIT * 1000) / 1000 + 0 };
      return { stationId: null, newStation: { geo: g }, hover: g };
    },
    zoom: () => canvasView.getView().zoom,
    sceneZoom: () => getScene().zoom,
  };
  const tools = {
    select: createGeoSelectTool(gctx),
    station: createPlaceStationTool(gctx),
    line: createDrawLineTool(gctx),
    delete: createDeleteTool(gctx),
  };
  const currentTool = () => tools[es.get().tool] || tools.select;
  canvasView.setInput({
    onTap: (p, w) => (es.get().pending ? pickPending({ store, es, hitTest: gctx.hitTest, toast: gctx.toast }, p, w) : currentTool().onTap?.(p, w)),
    onDoubleTap: (p, w) => currentTool().onDoubleTap?.(p, w) || false,
    onLongPress: (p, w) => currentTool().onLongPress?.(p, w),
    onDragStart: (p, w) => currentTool().onDragStart?.(p, w) || null,
    onHover: (p, w) => currentTool().onHover?.(p, w),
  });
  canvasView.canvas.addEventListener('pointerleave', () => gctx.setHover(null));

  canvasView.addLayer((c, view, size, dpr) => {
    const p = store.getState();
    if (p.world.mode !== 'fictional') return;
    if (terrain && base) drawTerrain(c, terrain, base.width * base.cellKm * GEO_UNIT, base.height * base.cellKm * GEO_UNIT, view.zoom);
    const sc = getScene();
    const s = es.get();
    const o = { project: p, scene: sc, es: s, zoom: view.zoom, accent: accentFor(p, s) };
    drawUnderlay(c, o);
    drawItems(c, sc.items, visibleWorldRect(view, size));
    drawSelectionRings(c, o);
    drawGeoEditOverlay(c, { ...o, ring: (id, color) => stationRing(c, sc, id, color, view.zoom) });
    // ここから画面の座標：縮尺バーと方位記号
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const insets = ctx.getInsets ? ctx.getInsets() : { top: 0, right: 0, bottom: 0, left: 0 };
    const mapT = mapTranslator(p.locale.mapLanguage);
    drawScaleBar(c, view.zoom * GEO_UNIT, size, insets, p, mapT);
    drawNorthArrow(c, insets, p, mapT);
  });

  /** 今の倍率の段階の表示リスト（データか段階が変わったら作り直す） */
  function getScene() {
    const p = store.getState();
    if (!sectionsKey || sectionsKey[0] !== p.stations || sectionsKey[1] !== p.lines) {
      sectionsKey = [p.stations, p.lines];
      sections = computeGeoSections(p);
    }
    const level = geoZoomLevel(canvasView.getView().zoom);
    const key = [sections, p.stations, p.lines, p.style, p.locale, p.world, vectors, level];
    if (!scene || sceneKey.some((v, i) => v !== key[i])) {
      sceneKey = key;
      scene = buildGeoScene(p, { measure, zoom: level, sections, vectors });
    }
    return scene;
  }

  /** 世界が変わったら、地形の下ごしらえを Worker に頼む */
  function ensureBase(p) {
    if (p.world.mode !== 'fictional') {
      baseKey = null;
      base = null;
      vectors = null;
      terrain = null;
      return;
    }
    const w = p.world;
    if (baseKey && baseKey[0] === w.terrain && baseKey[1] === w.gen && baseKey[2] === w.regions) return;
    const key = [w.terrain, w.gen, w.regions];
    baseKey = key;
    failed = false;
    requestTerrain({ kind: 'analyze', world: w }).then((res) => {
      if (baseKey !== key) return;
      terrain = {
        land: makeImage(res.rgba, res.imageWidth, res.imageHeight),
        sea: makeImage(res.seaRgba, res.width, res.height),
        landPath: ringsPath(res.outlines.land),
        lakePath: ringsPath(res.outlines.lakes),
      };
      // 画像にしたら画素の配列は要らない（標高と水は、あとで駅名の候補やトンネルの提案に使う）
      base = { ...res, rgba: null, seaRgba: null };
      vectors = geoBaseVectors(res);
      updateHint(store.getState());
      canvasView.requestRender();
    }, (e) => {
      if (baseKey !== key) return;
      console.error('[geo view]', e);
      failed = true;
      updateHint(store.getState());
    });
  }

  /** 画面の中央の案内：読み込み中・失敗・待っている操作・駅が無いとき */
  function updateHint(p) {
    const s = es.get();
    if (failed) canvasView.setHint(t('geo.failed'));
    else if (baseKey && !base) canvasView.setHint(t('geo.loading'));
    else if (s.pending) canvasView.setHint(pendingHint(s.pending));
    else canvasView.setHint(p.stations.some((st) => st.geo) ? null : t(s.tool === 'station' ? 'hint.placeStation' : 'hint.empty'));
  }

  return {
    el,
    /** 表示しているときに呼ぶ @param {import('../core/schema.js').Project} p */
    update(p) {
      ensureBase(p);
      updateHint(p);
      const s = es.get();
      rangeBtn.hidden = s.tool !== 'select';
      rangeBtn.setAttribute('aria-pressed', String(!!s.rangeMode));
      canvasView.setCursor(currentTool().cursor || 'default');
      canvasView.requestRender();
    },
    /** 今のツール（キーボードの操作に使う） */
    tool: () => currentTool(),
    /** 表示している表示リスト（デバッグ用。書き出しはステップ6で対応する） */
    getScene: () => scene,
    getBase: () => base,
    fitAll: () => canvasView.fitAll(),
    zoomBy: (f) => canvasView.zoomBy(f),
    /** 駅などの地理座標（km）が画面に入るように動かす @param {{ x: number, y: number }} g */
    reveal: (g) => canvasView.reveal(g.x * GEO_UNIT, g.y * GEO_UNIT),
    canvasView,
    dispose() {
      canvasView.dispose();
      terrain = null;
      base = null;
    },
  };
}

/**
 * 地形全体の範囲（世界座標）
 * @param {import('../core/schema.js').Project} p
 */
function worldExtent(p) {
  if (p.world.mode !== 'fictional') return null;
  const km = p.world.gen.size * p.world.gen.cellKm;
  return { minX: 0, minY: 0, maxX: km * GEO_UNIT, maxY: km * GEO_UNIT };
}
