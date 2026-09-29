// 「路線を引く」ツールのパネル：どの路線を引くか（新しい路線なら事業者・名前・色・記号）と完了ボタン
import { h } from '../dom.js';
import { t, mapTranslator } from '../../i18n/i18n.js';
import { LINE_PALETTE, nextColor } from '../../core/color.js';
import { field, textInput, selectInput, colorInput } from '../form.js';

/**
 * @param {{ store: any, es: any, finishDrawing: () => void }} ctx
 */
export function createLineToolPanel(ctx) {
  const { store, es } = ctx;
  const choice = selectInput({
    options: [],
    onChange: (v) => {
      es.set({ lineChoice: v, drawing: null });
    },
  });
  const setNew = (patch) => es.set({ newLine: { ...es.get().newLine, ...patch } });
  const operator = selectInput({ options: [], onChange: (v) => setNew({ operatorId: v }) });
  const name = textInput({ onChange: (v) => setNew({ name: v.trim() }) });
  const color = colorInput({ onChange: (v) => setNew({ color: v }), label: t('common.color') });
  const symbol = textInput({ onChange: (v) => setNew({ symbol: v.trim() }), maxLength: 4 });
  const newFields = h('div', { class: 'new-line-fields' },
    field(t('line.operator'), operator),
    field(t('line.name'), name),
    h('div', { class: 'field-row' },
      field(t('line.color'), color),
      field(t('line.symbol'), symbol),
    ),
  );
  const status = h('p', { class: 'panel-note' });
  const finish = h('button', { class: 'btn btn-primary', type: 'button', on: { click: () => ctx.finishDrawing() } }, t('tool.line.finish'));
  const el = h('div', {},
    h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, t('tool.line.panelTitle'))),
    h('div', { class: 'panel-section' },
      field(t('tool.line.target'), choice),
      newFields,
      status,
      h('div', { class: 'panel-actions' }, finish),
    ),
  );

  return {
    el,
    /** @param {import('../../core/schema.js').Project} p */
    update(p) {
      const s = es.get();
      const lines = [...p.lines].sort((a, b) => a.order - b.order);
      choice.setOptions([
        { value: 'new', label: t('tool.line.newLine') },
        ...lines.map((l) => ({ value: l.id, label: l.displayName || l.name })),
      ]);
      choice.value = s.lineChoice;
      const isNew = s.lineChoice === 'new' && !s.drawing;
      newFields.hidden = !isNew;
      operator.setOptions([
        { value: '', label: p.operators.length ? t('tool.line.firstOperator') : t('tool.line.autoOperator') },
        ...p.operators.map((o) => ({ value: o.id, label: o.name })),
      ]);
      operator.value = s.newLine.operatorId || '';
      name.setValue(s.newLine.name);
      name.placeholder = mapTranslator(p.locale.mapLanguage)('map.default.lineName', { n: p.lines.length + 1 });
      // 色を選んでいなければ、次に割り当てられる色を見せる
      color.setValue(s.newLine.color || nextColor(LINE_PALETTE, p.lines.map((l) => l.color)));
      symbol.setValue(s.newLine.symbol);

      const line = s.drawing ? p.lines.find((l) => l.id === s.drawing.lineId) : null;
      if (line) {
        status.textContent = t('tool.line.drawing', { name: line.displayName || line.name, count: line.stops.length });
      } else {
        status.textContent = t('tool.line.howTo');
      }
      finish.disabled = !line;
    },
  };
}
