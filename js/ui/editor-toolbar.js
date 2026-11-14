// エディタのツールバー（PC は左、スマホは画面の下）：選択・駅・路線・削除（PC だけ）・地形（地理ビューで架空の地形があるときだけ）と、
// データ表・チェックを開く・閉じるボタン
import { h } from './dom.js';
import { t } from '../i18n/i18n.js';
import { icon } from './icons.js';

/**
 * @param {{ es: any, setTool: (id: string) => void }} ctx
 */
export function createToolbar(ctx) {
  const { es } = ctx;
  const toolDefs = [
    { id: 'select', icon: 'select', label: t('tool.select'), title: t('tool.select.title') },
    { id: 'station', icon: 'station', label: t('tool.station'), title: t('tool.station.title') },
    { id: 'line', icon: 'line', label: t('tool.line'), title: t('tool.line.title') },
    // 削除ツールは PC だけ（スマホは長押しメニューとパネルのボタンで削除する）
    { id: 'delete', icon: 'delete', label: t('tool.delete'), title: t('tool.delete.title'), pcOnly: true },
    // 地形ブラシは地理ビューだけ
    { id: 'brush', icon: 'terrain', label: t('tool.brush'), title: t('tool.brush.title') },
  ];
  /** @type {Map<string, HTMLElement>} */
  const toolButtons = new Map();
  // データ表とチェックを開く・閉じる（ツールではないので押した状態は別に持つ）
  const toggleDrawer = (name) => es.set({ drawer: es.get().drawer === name ? null : name });
  const dataBtn = h('button', {
    class: 'badge-btn data-toggle',
    type: 'button',
    title: t('tool.data.title'),
    'aria-pressed': 'false',
    on: { click: () => toggleDrawer('data') },
  }, icon('data'), h('span', { class: 'badge-label' }, t('tool.data')));
  const checkCount = h('span', { class: 'badge-count', hidden: true });
  const checkBtn = h('button', {
    class: 'badge-btn check-toggle',
    type: 'button',
    title: t('tool.check.title'),
    'aria-pressed': 'false',
    on: { click: () => toggleDrawer('check') },
  }, icon('check'), h('span', { class: 'badge-label' }, t('check.title')), checkCount);
  const el = h('nav', { class: 'ed-tools', 'aria-label': t('tool.label') },
    toolDefs.map((d) => {
      const b = h('button', {
        class: ['badge-btn', d.pcOnly ? 'pc-only' : ''],
        type: 'button',
        title: d.title,
        'aria-pressed': 'false',
        on: { click: () => ctx.setTool(d.id) },
      }, icon(d.icon), h('span', { class: 'badge-label' }, d.label));
      toolButtons.set(d.id, b);
      return b;
    }),
    dataBtn,
    checkBtn,
  );

  return {
    el,
    /**
     * @param {import('./editor-state.js').EditorState} s
     * @param {{ toolsOff: boolean, brush: boolean, checkCount: number }} o toolsOff：描くツールを隠す（案内図・駅名標）、brush：地形ブラシを出す
     */
    update(s, o) {
      for (const [id, b] of toolButtons) {
        b.classList.toggle('is-hidden', o.toolsOff || (id === 'brush' && !o.brush));
        b.setAttribute('aria-pressed', String(s.tool === id));
      }
      dataBtn.setAttribute('aria-pressed', String(s.drawer === 'data'));
      checkBtn.setAttribute('aria-pressed', String(s.drawer === 'check'));
      checkCount.hidden = o.checkCount === 0;
      checkCount.textContent = o.checkCount > 99 ? '99+' : String(o.checkCount);
    },
  };
}
