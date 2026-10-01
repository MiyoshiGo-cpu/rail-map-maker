// 地理ビュー（§5.4）：架空の地形（段彩と陰影の画像）の上に、県境・川・都市・線路・駅・駅名を描く。
// 地形の画像・川・県境は、保存した世界から Worker で作り直し（terrain-client.js の analyze）、画像は1回だけ canvas に描いて拡大縮小する。
// 表示リストは倍率の段階が変わったときに作り直す（線の太さと文字の大きさを画面で一定にするため）。
// 縮尺バーと方位記号は画面に重ねて描く。タップで駅・区間を選べる（編集のツールはステップ5で足す）。
import { h } from './dom.js';
import { t, mapTranslator } from '../i18n/i18n.js';
import { createCanvasView } from './canvas-view.js';
import { requestTerrain } from './terrain-client.js';
import { computeGeoSections } from '../core/geo-lines.js';
import { buildGeoScene, geoBaseVectors, geoZoomLevel } from '../render/scene-geo.js';
import { drawItems, createMeasure } from '../render/backend-canvas.js';
import { mapFont } from '../render/styles.js';
import { LAKE_COLOR, SHORE_COLOR } from '../render/terrain-raster.js';
import { visibleWorldRect, GEO_UNIT, GEO_ZOOM } from '../core/viewport.js';
import { drawUnderlay, drawSelectionRings } from './overlay.js';
import { accentFor, NO_SELECTION } from './editor-state.js';

/** 当たり判定の半径（画面の px。§4.4） */
const HIT_RADIUS = { touch: 22, mouse: 8, pen: 12 };
/** 地形の外の色 */
const OUTSIDE = '#D5DDE5';
const OVERLAY_INK = '#1F2933';
const OVERLAY_PAPER = 'rgba(255,255,255,0.85)';
/** 縮尺バーの長さの区切り（1・2・5 × 10 のべき） */
const NICE = [1, 2, 5];
const KM_PER_MILE = 1.609344;

/**
 * @param {{
 *   store: any,
 *   es: any,
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
    // ここから画面の座標：縮尺バーと方位記号
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const insets = ctx.getInsets ? ctx.getInsets() : { top: 0, right: 0, bottom: 0, left: 0 };
    const mapT = mapTranslator(p.locale.mapLanguage);
    drawScaleBar(c, view.zoom * GEO_UNIT, size, insets, p, mapT);
    drawNorthArrow(c, insets, p, mapT);
  });

  canvasView.setInput({
    onTap: (pt, w) => {
      const r = (HIT_RADIUS[pt.pointerType] ?? 8) / canvasView.getView().zoom;
      const target = getScene().index.hitTest(w.x, w.y, r);
      if (!target) es.set({ selection: NO_SELECTION });
      else if (target.type === 'station' || target.type === 'label') es.set({ selection: { type: 'stations', ids: [target.id] } });
      else if (target.type === 'section') es.set({ selection: { type: 'section', lineId: target.lineId, index: target.index } });
    },
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
    updateHint();
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
      updateHint();
      canvasView.requestRender();
    }, (e) => {
      if (baseKey !== key) return;
      console.error('[geo view]', e);
      failed = true;
      updateHint();
    });
  }

  function updateHint() {
    if (failed) canvasView.setHint(t('geo.failed'));
    else if (baseKey && !base) canvasView.setHint(t('geo.loading'));
    else canvasView.setHint(null);
  }

  return {
    el,
    /** 表示しているときに呼ぶ @param {import('../core/schema.js').Project} p */
    update(p) {
      ensureBase(p);
      canvasView.requestRender();
    },
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

/**
 * 画素の配列を canvas に描く
 * @param {Uint8ClampedArray} rgba
 * @param {number} width
 * @param {number} height
 */
function makeImage(rgba, width, height) {
  const cv = document.createElement('canvas');
  cv.width = width;
  cv.height = height;
  const c = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  c.putImageData(new ImageData(rgba, width, height), 0, 0);
  return cv;
}

/**
 * 輪（km の x, y の並び）を世界座標の Path2D にする
 * @param {number[][]} rings
 */
function ringsPath(rings) {
  const path = new Path2D();
  for (const r of rings) {
    path.moveTo(r[0] * GEO_UNIT, r[1] * GEO_UNIT);
    for (let i = 2; i < r.length; i += 2) path.lineTo(r[i] * GEO_UNIT, r[i + 1] * GEO_UNIT);
    path.closePath();
  }
  return path;
}

/**
 * 地形：海の画像の上に、海岸線の形で切り抜いた陸の画像を重ね、湖を塗って岸に細い線を引く
 * @param {CanvasRenderingContext2D} c 世界座標
 * @param {{ land: HTMLCanvasElement, sea: HTMLCanvasElement, landPath: Path2D, lakePath: Path2D }} tr
 * @param {number} w 地形の幅（世界座標）
 * @param {number} hgt
 * @param {number} zoom
 */
function drawTerrain(c, tr, w, hgt, zoom) {
  c.imageSmoothingEnabled = true;
  c.drawImage(tr.sea, 0, 0, w, hgt);
  c.save();
  c.clip(tr.landPath, 'evenodd');
  c.drawImage(tr.land, 0, 0, w, hgt);
  c.restore();
  c.fillStyle = LAKE_COLOR;
  c.fill(tr.lakePath, 'evenodd');
  c.strokeStyle = SHORE_COLOR;
  c.lineWidth = 0.8 / zoom;
  c.lineJoin = 'round';
  c.stroke(tr.landPath);
  c.stroke(tr.lakePath);
}

/** 数を短く（0.5・10・200） */
const numText = (n) => String(Math.round(n * 1000) / 1000);

/**
 * 縮尺バー（左下。スマホではシートの上）。長さは 1・2・5 の区切りで、画面で140px 以内
 * @param {CanvasRenderingContext2D} c 画面の座標
 * @param {number} pxPerKm
 * @param {{ width: number, height: number }} size
 * @param {{ bottom: number, left: number }} insets
 * @param {import('../core/schema.js').Project} p
 * @param {(key: string, vars?: any) => string} mapT
 */
function drawScaleBar(c, pxPerKm, size, insets, p, mapT) {
  const mile = p.locale.distanceUnit === 'mi';
  const pxPerUnit = pxPerKm * (mile ? KM_PER_MILE : 1);
  const maxPx = Math.min(140, size.width * 0.4);
  let best = null;
  for (let e = -2; e <= 4; e++) {
    for (const m of NICE) {
      const n = m * 10 ** e;
      const len = n * pxPerUnit;
      if (len <= maxPx && (!best || len > best.len)) best = { n, len };
    }
  }
  if (!best) return;
  const text = mapT(mile ? 'map.scale.mi' : 'map.scale.km', { n: numText(best.n) });
  const font = mapFont(p.style, 11, 600);
  c.font = font;
  const tw = c.measureText(text).width;
  const x = insets.left + 12;
  const y = size.height - insets.bottom - 14;
  const barH = 5;
  // 地（読みやすいように白い板を敷く）
  c.fillStyle = OVERLAY_PAPER;
  c.beginPath();
  c.roundRect(x - 6, y - 22, Math.max(best.len, tw) + 12, 30, 4);
  c.fill();
  // 半分ずつ黒と白の帯
  const half = best.len / 2;
  c.fillStyle = OVERLAY_INK;
  c.fillRect(x, y - barH, half, barH);
  c.fillStyle = '#FFFFFF';
  c.fillRect(x + half, y - barH, half, barH);
  c.strokeStyle = OVERLAY_INK;
  c.lineWidth = 1;
  c.strokeRect(x + 0.5, y - barH + 0.5, best.len - 1, barH - 1);
  c.fillStyle = OVERLAY_INK;
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.fillText(text, x, y - barH - 4);
}

/**
 * 方位記号（左上）：北を指す矢じりと N
 * @param {CanvasRenderingContext2D} c 画面の座標
 * @param {{ top: number, left: number }} insets
 * @param {import('../core/schema.js').Project} p
 * @param {(key: string, vars?: any) => string} mapT
 */
function drawNorthArrow(c, insets, p, mapT) {
  const cx = insets.left + 28;
  const cy = insets.top + 32;
  c.fillStyle = OVERLAY_PAPER;
  c.beginPath();
  c.arc(cx, cy, 19, 0, Math.PI * 2);
  c.fill();
  // 矢じり：左半分を塗り、右半分は白
  const top = cy - 5;
  const bottom = cy + 14;
  c.beginPath();
  c.moveTo(cx, top);
  c.lineTo(cx - 6, bottom);
  c.lineTo(cx, bottom - 4);
  c.closePath();
  c.fillStyle = OVERLAY_INK;
  c.fill();
  c.beginPath();
  c.moveTo(cx, top);
  c.lineTo(cx + 6, bottom);
  c.lineTo(cx, bottom - 4);
  c.closePath();
  c.fillStyle = '#FFFFFF';
  c.fill();
  c.strokeStyle = OVERLAY_INK;
  c.lineWidth = 1;
  c.lineJoin = 'round';
  c.stroke();
  c.font = mapFont(p.style, 10, 700);
  c.fillStyle = OVERLAY_INK;
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  c.fillText(mapT('map.north'), cx, top - 2);
}
