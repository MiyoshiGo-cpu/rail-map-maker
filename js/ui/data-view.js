// データ表（§4.3）：事業者・路線・駅・乗換のタブ。PC は表（並べ替え・絞り込み・その場で編集）、
// スマホはカード一覧（タップで詳細のシートを開く）。路線の駅の並べ替えと営業キロは「駅の並び」で編集する。
import { h } from './dom.js';
import { icon } from './icons.js';
import { t } from '../i18n/i18n.js';
import { normalizeForSearch } from '../core/search.js';
import { createGrid } from './grid.js';
import { enableRowDrag } from './row-drag.js';
import { createStopsEditor } from './stops-editor.js';
import { TABS as BASE_TABS, TAB_ORDER as BASE_ORDER } from './data-tabs.js';
import { SERVICE_TABS, SERVICE_TAB_ORDER } from './data-tabs-services.js';
import { openMenu } from './menu.js';
import { toast } from './toast.js';
import { getRegion } from '../core/regions/index.js';

const TABS = { ...BASE_TABS, ...SERVICE_TABS };
const TAB_ORDER = [...BASE_ORDER, ...SERVICE_TAB_ORDER];

const MOBILE = '(max-width: 899.98px)';

/**
 * @param {{
 *   store: any,
 *   es: any,
 *   close: () => void,
 *   activate: (sel: any, opt?: { reveal?: { x: number, y: number } | null }) => void,
 * }} ctx
 */
export function createDataView(ctx) {
  const { store, es } = ctx;
  let tab = 'lines';
  let query = '';
  /** @type {string | null} 駅の並びを編集している路線 */
  let stopsLine = null;
  let stops = null;
  const mq = window.matchMedia(MOBILE);

  const tabButtons = new Map();
  const tabs = h('div', { class: 'data-tabs', role: 'tablist', 'aria-label': t('data.title') },
    TAB_ORDER.map((k) => {
      const b = h('button', {
        class: 'badge-btn',
        type: 'button',
        role: 'tab',
        'aria-selected': 'false',
        on: { click: () => { tab = k; stopsLine = null; rebuild(); } },
      }, h('span', { class: 'badge-label' }, t(TABS[k].label)));
      tabButtons.set(k, b);
      return b;
    }),
  );
  const filter = /** @type {HTMLInputElement} */ (h('input', {
    class: 'input data-filter',
    type: 'search',
    placeholder: t('data.filter'),
    'aria-label': t('data.filter'),
    on: { input: () => { query = normalizeForSearch(filter.value); refresh(); } },
  }));
  const addOperator = h('button', {
    class: 'btn btn-small',
    type: 'button',
    on: { click: () => store.dispatch({ type: 'operator/add' }) },
  }, icon('plus'), t('data.addOperator'));
  // 種別を追加：事業者を選び、プリセットをまとめてか1つだけ追加する
  const addType = h('button', {
    class: 'btn btn-small',
    type: 'button',
    on: {
      click: () => {
        const p = store.getState();
        if (!p.operators.length) {
          toast(t('serviceType.needOperator'));
          return;
        }
        const region = getRegion(p.locale.region);
        const presetMenu = (op) => openMenu(addType, [
          ...region.serviceTypePresets.map((x) => ({
            label: t(x.labelKey),
            onSelect: () => {
              const ids = store.dispatch({ type: 'serviceType/addPreset', operatorId: op.id, presetId: x.id });
              toast(ids.length ? t('serviceType.added', { count: ids.length }) : t('serviceType.addedNone'));
            },
          })),
          { separator: true },
          { label: t('serviceType.addOne'), onSelect: () => ctx.activate({ type: 'serviceType', id: store.dispatch({ type: 'serviceType/add', operatorId: op.id }) }) },
        ], { label: t('serviceType.addTo', { name: op.name }) });
        if (p.operators.length === 1) presetMenu(p.operators[0]);
        else openMenu(addType, p.operators.map((op) => ({ label: t('serviceType.addTo', { name: op.name }), onSelect: () => presetMenu(op) })), { label: t('data.addType') });
      },
    },
  }, icon('plus'), t('data.addType'));
  // 系統を追加：パネルで始発駅・終着駅・種別を選んで作る
  const addService = h('button', {
    class: 'btn btn-small',
    type: 'button',
    on: {
      click: () => {
        es.set({ tool: 'select', drawing: null, selection: { type: 'none' }, routeDraft: { serviceId: null, from: '', to: '', via: [], typeId: '' } });
        // スマホでは表を閉じて、パネルを見せる
        if (mq.matches) ctx.close();
      },
    },
  }, icon('plus'), t('data.addService'));
  const body = h('div', { class: 'data-body' });
  const el = h('section', { class: 'ed-data', 'aria-label': t('data.title') },
    h('div', { class: 'data-head' },
      tabs,
      filter,
      addOperator,
      addType,
      addService,
      h('button', { class: 'icon-btn on-paper-btn', type: 'button', 'aria-label': t('common.close'), title: t('common.close'), on: { click: () => ctx.close() } }, icon('close')),
    ),
    body,
  );

  /** 表の行から呼ぶ道具 */
  const tabCtx = {
    store,
    activate: (sel, opt) => ctx.activate(sel, opt),
    openStops: (lineId) => { stopsLine = lineId; rebuild(); },
    moveLineOrder(lineId, delta) {
      const ids = [...store.getState().lines].sort((a, b) => a.order - b.order).map((l) => l.id);
      const i = ids.indexOf(lineId);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      store.dispatch({ type: 'line/reorder', lineIds: ids });
    },
  };

  /** 並び順の入れ替え（ドラッグ）。表示中の行の並び（絞り込み後）で位置を読み替える */
  function reorderVisible(from, to) {
    const visible = TABS.lines.rows(store.getState(), query).map((r) => r.line.id);
    const moved = visible[from];
    const all = [...store.getState().lines].sort((a, b) => a.order - b.order).map((l) => l.id);
    const rest = all.filter((id) => id !== moved);
    // 移した先の直後の行の前に入れる（最後なら最後の表示行の後ろ）
    const restVisible = visible.filter((id) => id !== moved);
    const anchor = restVisible[to];
    const at = anchor ? rest.indexOf(anchor) : rest.indexOf(restVisible[restVisible.length - 1]) + 1;
    rest.splice(at, 0, moved);
    store.dispatch({ type: 'line/reorder', lineIds: rest });
  }

  /** @type {{ render: (p: any) => void, dispose?: () => void } | null} */
  let view = null;

  function buildGrid() {
    const def = TABS[tab];
    const grid = createGrid({
      columns: def.columns(tabCtx),
      rowKey: def.rowKey,
      onActivate: (row) => def.activate(row, tabCtx),
      caption: t(def.label),
    });
    const wrap = h('div', { class: 'grid-wrap' }, grid.el);
    const emptyNote = h('p', { class: 'panel-empty', hidden: true });
    body.replaceChildren(wrap, emptyNote);
    let detach = null;
    if (tab === 'lines') {
      detach = enableRowDrag(grid.tbody, (from, to) => {
        if (grid.isSorted()) return; // 並べ替え中は並び順を変えない
        reorderVisible(from, to);
      });
    }
    return {
      render(p) {
        const rows = def.rows(p, query);
        grid.render(rows);
        wrap.classList.toggle('is-empty', rows.length === 0);
        emptyNote.hidden = rows.length > 0;
        emptyNote.textContent = def.empty && !query ? t(def.empty) : t('data.empty');
        const key = def.selectedKey(es.get().selection);
        grid.markSelected((k) => k === key);
      },
      dispose: () => detach && detach(),
    };
  }

  function buildCards() {
    const def = TABS[tab];
    const list = h('ul', { class: 'card-list' });
    body.replaceChildren(list);
    let detach = null;
    if (tab === 'lines') detach = enableRowDrag(list, (from, to) => reorderVisible(from, to));
    return {
      render(p) {
        const rows = def.rows(p, query);
        const key = def.selectedKey(es.get().selection);
        list.replaceChildren(...rows.map((row) => {
          const c = def.card(row);
          const main = h('button', {
            class: 'card-main',
            type: 'button',
            on: { click: () => def.activate(row, tabCtx) },
          },
          c.color ? h('span', { class: 'swatch', style: { background: c.color } }) : null,
          h('span', { class: 'card-text' }, h('span', { class: 'card-title' }, c.title), c.sub ? h('span', { class: 'card-sub' }, c.sub) : null));
          const extra = tab === 'lines'
            ? h('span', { class: 'card-extra' },
              h('button', { class: 'btn btn-small', type: 'button', on: { click: () => tabCtx.openStops(row.line.id) } }, t('data.stops')),
              h('span', { class: 'drag-grip', dataset: { dragHandle: '' }, 'aria-hidden': 'true' }, icon('grip')),
            )
            : null;
          return h('li', { class: ['card', def.rowKey(row) === key ? 'is-selected' : ''] }, main, extra);
        }));
        if (!rows.length) list.append(h('li', { class: 'panel-empty' }, def.empty && !query ? t(def.empty) : t('data.empty')));
      },
      dispose: () => detach && detach(),
    };
  }

  function rebuild() {
    if (view && view.dispose) view.dispose();
    if (stops) {
      stops.dispose();
      stops = null;
    }
    for (const [k, b] of tabButtons) b.setAttribute('aria-selected', String(k === tab));
    addOperator.hidden = tab !== 'operators';
    addType.hidden = tab !== 'serviceTypes';
    addService.hidden = tab !== 'services';
    filter.hidden = !!stopsLine;
    if (stopsLine) {
      stops = createStopsEditor({
        store,
        es,
        back: () => { stopsLine = null; rebuild(); },
        activateStation: (id) => {
          const st = store.getState().stations.find((s) => s.id === id);
          ctx.activate({ type: 'stations', ids: [id] }, { reveal: st && st.schematic });
        },
      }, stopsLine);
      body.replaceChildren(stops.el);
      view = { render: (p) => stops && stops.update(p) };
    } else {
      view = mq.matches ? buildCards() : buildGrid();
    }
    refresh();
  }

  function refresh() {
    if (view) view.render(store.getState());
  }

  mq.addEventListener('change', rebuild);
  rebuild();

  return {
    el,
    update: refresh,
    dispose() {
      mq.removeEventListener('change', rebuild);
      if (view && view.dispose) view.dispose();
      if (stops) stops.dispose();
    },
  };
}
