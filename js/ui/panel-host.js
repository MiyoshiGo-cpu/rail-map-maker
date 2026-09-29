// プロパティパネルの置き場所。ツールと選択に合わせてパネルを切り替える。
// スマホでは同じ要素がボトムシート（見出しだけ／半分／全体）になり、つまみのドラッグで高さを変えられる。
import { h } from './dom.js';
import { t } from '../i18n/i18n.js';
import { createProjectPanel } from './panels/project-panel.js';
import { createStationPanel } from './panels/station-panel.js';
import { createStationsPanel } from './panels/stations-panel.js';
import { createLinePanel } from './panels/line-panel.js';
import { createSectionPanel } from './panels/section-panel.js';
import { createOperatorPanel } from './panels/operator-panel.js';
import { createLineToolPanel } from './panels/line-tool-panel.js';
import { createInterchangePanel } from './panels/interchange-panel.js';
import { createServiceTypePanel } from './panels/service-type-panel.js';

const STAGES = ['peek', 'half', 'full'];
const PEEK = 64;

/**
 * @param {{
 *   store: any,
 *   es: ReturnType<typeof import('./editor-state.js').createEditorState>,
 *   toast: (m: string) => void,
 *   finishDrawing: () => void,
 *   onDelete: (ids: string[]) => void,
 *   onDeleteLine: (lineId: string) => void,
 *   deleteSection: (lineId: string, index: number) => void,
 *   align: (mode: 'horizontal'|'vertical'|'diagonal'|'even') => void,
 *   deleteSelection: () => void,
 * }} ctx
 */
export function createPanelHost(ctx) {
  const body = h('div', { class: 'ed-panel-body' });
  const handle = h('button', { class: 'sheet-handle', type: 'button', 'aria-label': t('panel.resize') });
  const el = h('aside', { class: 'ed-panel', dataset: { stage: 'peek' }, 'aria-label': t('panel.label') },
    handle,
    h('div', { class: 'panel-accent' }),
    body,
  );
  let key = '';
  /** @type {{ el: HTMLElement, update: (p: any, s?: any) => void, focusName?: () => void } | null} */
  let panel = null;

  // ---------- ボトムシートの高さ（つまみのタップで切り替え、ドラッグで自由に） ----------
  const isSheet = () => getComputedStyle(el).position === 'absolute';
  const fullHeight = () => el.getBoundingClientRect().height;
  const stageHeight = (stage) => {
    const full = fullHeight();
    if (stage === 'full') return full;
    if (stage === 'half') return Math.min(window.innerHeight * 0.48, full);
    return PEEK;
  };
  let drag = null;
  handle.addEventListener('pointerdown', (e) => {
    if (!isSheet()) return;
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      // 捕捉できなくても続ける
    }
    drag = { y0: e.clientY, h0: stageHeight(el.dataset.stage || 'peek'), moved: false, t0: performance.now() };
    el.classList.add('is-dragging');
  });
  handle.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dy = e.clientY - drag.y0;
    if (Math.abs(dy) > 4) drag.moved = true;
    const hgt = Math.max(0, Math.min(fullHeight(), drag.h0 - dy));
    el.style.setProperty('--sheet-visible', hgt + 'px');
  });
  const endDrag = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    el.classList.remove('is-dragging');
    el.style.removeProperty('--sheet-visible');
    if (!d.moved) {
      cycle();
      return;
    }
    // 離した高さに近い段階へ。速く払ったらその向きへ1段進める
    const dy = e.clientY - d.y0;
    const hgt = d.h0 - dy;
    const v = dy / Math.max(1, performance.now() - d.t0);
    let best = STAGES[0];
    for (const s of STAGES) if (Math.abs(stageHeight(s) - hgt) < Math.abs(stageHeight(best) - hgt)) best = s;
    if (Math.abs(v) > 0.6) {
      const i = STAGES.indexOf(el.dataset.stage || 'peek');
      best = STAGES[Math.max(0, Math.min(STAGES.length - 1, i + (v < 0 ? 1 : -1)))];
    }
    el.dataset.stage = best;
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
  handle.addEventListener('click', (e) => {
    // キーボードで押したとき（ポインター操作は pointerup で扱う）
    if (e.detail === 0) cycle();
  });

  function cycle() {
    const cur = el.dataset.stage || 'peek';
    el.dataset.stage = STAGES[(STAGES.indexOf(cur) + 1) % STAGES.length];
  }

  /** 選択とツールから、出すパネルの鍵を決める */
  function keyOf() {
    const s = ctx.es.get();
    if (s.tool === 'line') return 'lineTool';
    const sel = s.selection;
    if (sel.type === 'stations' && sel.ids.length === 1) return `station:${sel.ids[0]}`;
    if (sel.type === 'stations' && sel.ids.length > 1) return 'stations';
    if (sel.type === 'line') return `line:${sel.lineId}`;
    if (sel.type === 'section') return `section:${sel.lineId}:${sel.index}`;
    if (sel.type === 'operator') return `operator:${sel.id}`;
    if (sel.type === 'interchange') return `interchange:${sel.id}`;
    if (sel.type === 'serviceType') return `serviceType:${sel.id}`;
    return 'project';
  }

  function create(k) {
    const [kind, a, b] = k.split(':');
    switch (kind) {
      case 'lineTool': return createLineToolPanel(ctx);
      case 'station': return createStationPanel(ctx, a);
      case 'stations': return createStationsPanel(ctx);
      case 'line': return createLinePanel(ctx, a);
      case 'section': return createSectionPanel(ctx, a, Number(b));
      case 'operator': return createOperatorPanel(ctx, a);
      case 'interchange': return createInterchangePanel(ctx, a);
      case 'serviceType': return createServiceTypePanel(ctx, a);
      default: return createProjectPanel(ctx);
    }
  }

  return {
    el,
    /** @param {import('../core/schema.js').Project} p */
    update(p) {
      const k = keyOf();
      if (k !== key) {
        const wasProject = key === 'project' || key === '';
        key = k;
        panel = create(k);
        body.replaceChildren(panel.el);
        body.scrollTop = 0;
        // スマホ：何かを選んだらシートを半分まで出す。選択を外したら見出しだけに戻す
        if (k === 'project') el.dataset.stage = 'peek';
        else if (wasProject && el.dataset.stage === 'peek') el.dataset.stage = 'half';
      }
      // 見出しの上の帯は --accent（選んでいる路線の色）を使う
      panel.update(p, ctx.es.get());
    },
    focusStationName() {
      if (panel && panel.focusName) {
        if (el.dataset.stage === 'peek') el.dataset.stage = 'half';
        panel.focusName();
      }
    },
  };
}
