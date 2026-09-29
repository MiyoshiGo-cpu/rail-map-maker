// プロパティパネルの置き場所。ツールと選択に合わせてパネルを切り替える。
// スマホでは同じ要素がボトムシート（見出しだけ／半分／全体）になる。
import { h } from './dom.js';
import { t } from '../i18n/i18n.js';
import { createProjectPanel } from './panels/project-panel.js';
import { createStationPanel } from './panels/station-panel.js';
import { createLinePanel } from './panels/line-panel.js';
import { createLineToolPanel } from './panels/line-tool-panel.js';

const STAGES = ['peek', 'half', 'full'];

/**
 * @param {{
 *   store: any,
 *   es: ReturnType<typeof import('./editor-state.js').createEditorState>,
 *   finishDrawing: () => void,
 *   onDelete: (ids: string[]) => void,
 *   onDeleteLine: (lineId: string) => void,
 * }} ctx
 */
export function createPanelHost(ctx) {
  const body = h('div', { class: 'ed-panel-body' });
  const handle = h('button', { class: 'sheet-handle', type: 'button', 'aria-label': t('panel.resize'), on: { click: () => cycle() } });
  const el = h('aside', { class: 'ed-panel', dataset: { stage: 'peek' }, 'aria-label': t('panel.label') },
    handle,
    h('div', { class: 'panel-accent' }),
    body,
  );
  let key = '';
  /** @type {{ el: HTMLElement, update: (p: any) => void, focusName?: () => void } | null} */
  let panel = null;

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
    if (sel.type === 'line') return `line:${sel.lineId}`;
    if (sel.type === 'section') return `section:${sel.lineId}:${sel.index}`;
    return 'project';
  }

  function create(k) {
    const [kind, a, b] = k.split(':');
    switch (kind) {
      case 'lineTool': return createLineToolPanel(ctx);
      case 'station': return createStationPanel(ctx, a);
      case 'line': return createLinePanel(ctx, a, null);
      case 'section': return createLinePanel(ctx, a, Number(b));
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
        // スマホ：何かを選んだらシートを半分まで出す。選択を外したら見出しだけに戻す
        if (k === 'project') el.dataset.stage = 'peek';
        else if (wasProject && el.dataset.stage === 'peek') el.dataset.stage = 'half';
      }
      // 見出しの上の帯は --accent（選んでいる路線の色）を使う
      panel.update(p);
    },
    focusStationName() {
      if (panel && panel.focusName) {
        if (el.dataset.stage === 'peek') el.dataset.stage = 'half';
        panel.focusName();
      }
    },
  };
}
