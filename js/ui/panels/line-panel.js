// 路線のパネル（ステップ7では名前・色・記号・事業者。全項目はステップ10で足す）
import { h } from '../dom.js';
import { t } from '../../i18n/i18n.js';
import { field, textInput, selectInput, colorInput } from '../form.js';

/**
 * @param {{ store: any, onDeleteLine: (lineId: string) => void }} ctx
 * @param {string} lineId
 * @param {number | null} sectionIndex 区間を選んでいるときの番号
 */
export function createLinePanel(ctx, lineId, sectionIndex) {
  const { store } = ctx;
  const set = (fields) => store.dispatch({ type: 'line/update', lineId, fields });
  const title = h('h2', { class: 'panel-title' });
  const operator = selectInput({ options: [], onChange: (v) => set({ operatorId: v }) });
  const name = textInput({ onChange: (v) => { if (v.trim()) set({ name: v.trim() }); } });
  const color = colorInput({ onChange: (v) => set({ color: v }), label: t('line.color') });
  const symbol = textInput({ onChange: (v) => set({ symbol: v.trim() }), maxLength: 4 });
  const info = h('p', { class: 'panel-note' });
  const el = h('div', {},
    h('div', { class: 'panel-head' }, title),
    h('div', { class: 'panel-section' },
      field(t('line.operator'), operator),
      field(t('line.name'), name),
      h('div', { class: 'field-row' },
        field(t('line.color'), color),
        field(t('line.symbol'), symbol),
      ),
      info,
      h('div', { class: 'panel-actions' },
        h('button', { class: 'btn btn-small', type: 'button', on: { click: () => ctx.onDeleteLine(lineId) } }, t('line.delete')),
      ),
    ),
  );
  return {
    el,
    /** @param {import('../../core/schema.js').Project} p */
    update(p) {
      const line = p.lines.find((l) => l.id === lineId);
      if (!line) return;
      title.textContent = line.displayName || line.name;
      operator.setOptions(p.operators.map((o) => ({ value: o.id, label: o.name })));
      operator.setValue(line.operatorId);
      name.setValue(line.name);
      color.setValue(line.color);
      symbol.setValue(line.symbol);
      const count = line.stops.length;
      info.textContent = sectionIndex === null
        ? t('line.summary', { count })
        : t('line.sectionSummary', { index: sectionIndex + 1, count });
    },
  };
}
