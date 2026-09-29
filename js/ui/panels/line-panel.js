// 路線のパネル（§3 Line）：基本・駅ナンバリングの規則・区間の既定値・駅の一覧
import { h } from '../dom.js';
import { t } from '../../i18n/i18n.js';
import { LINE_KINDS, ELECTRIFICATIONS, COLLECTIONS, TRACKS, STRUCTURES, LINE_STATUSES, UP_DIRECTIONS, GAUGE_CANDIDATES } from '../../core/schema.js';
import { field, textInput, textArea, selectInput, numberInput, checkInput, colorInput, group, enumOptions, gaugeInput } from '../form.js';

const NEW_OPERATOR = '__new__';

/** 軌間の欄の表示名 */
export function gaugeLabels(inherit) {
  return {
    none: t('gauge.none'),
    other: t('gauge.other'),
    mm: (v) => t('unit.mm', { value: v }),
    inherit,
  };
}

/**
 * @param {{ store: any, es: any, toast: (m: string) => void, onDeleteLine: (lineId: string) => void }} ctx
 * @param {string} lineId
 */
export function createLinePanel(ctx, lineId) {
  const { store, es } = ctx;
  const cur = () => store.getState().lines.find((l) => l.id === lineId);
  const set = (fields) => store.dispatch({ type: 'line/update', lineId, fields });
  const setDefaults = (fields) => store.dispatch({ type: 'line/defaults', lineId, fields });
  const setNumbering = (fields) => store.dispatch({ type: 'line/numbering', lineId, fields });
  const year = (v) => (v === null ? undefined : Math.round(v));

  const title = h('h2', { class: 'panel-title' });

  // ---------- 基本 ----------
  const operator = selectInput({
    options: [],
    onChange: (v) => {
      if (v === NEW_OPERATOR) {
        const id = store.dispatch({ type: 'operator/add' });
        set({ operatorId: id });
        es.set({ selection: { type: 'operator', id } });
        return;
      }
      set({ operatorId: v });
    },
  });
  const editOperator = h('button', {
    class: 'btn btn-small',
    type: 'button',
    on: { click: () => es.set({ selection: { type: 'operator', id: cur().operatorId } }) },
  }, t('line.editOperator'));
  const name = textInput({ onChange: (v) => { if (v.trim()) set({ name: v.trim() }); } });
  const displayName = textInput({ onChange: (v) => set({ displayName: v.trim() || undefined }) });
  const nameEn = textInput({ onChange: (v) => set({ names: { ...cur().names, en: v.trim() || undefined } }), lang: 'en' });
  const kind = selectInput({ options: enumOptions(LINE_KINDS, (v) => t('lineKind.' + v)), onChange: (v) => set({ kind: v }) });
  const color = colorInput({ onChange: (v) => set({ color: v }), label: t('line.color') });
  const symbol = textInput({ onChange: (v) => set({ symbol: v.trim() }), maxLength: 4 });
  const upDir = selectInput({ options: enumOptions(UP_DIRECTIONS, (v) => t('upDirection.' + v)), onChange: (v) => set({ upDirection: v }) });
  const loop = checkInput({
    label: t('line.isLoop'),
    onChange: (v) => {
      if (v && cur().stops.length < 3) {
        ctx.toast(t('line.loopNeeds3'));
        loop.setValue(false);
        return;
      }
      store.dispatch({ type: 'line/setLoop', lineId, isLoop: v });
    },
  });
  const status = selectInput({ options: enumOptions(LINE_STATUSES, (v) => t('status.' + v)), onChange: (v) => set({ status: v }) });
  const opened = numberInput({ step: 1, onChange: (v) => set({ openedYear: year(v) }) });
  const closed = numberInput({ step: 1, onChange: (v) => set({ closedYear: year(v) }) });
  const note = textArea({ onChange: (v) => set({ note: v.trim() || undefined }) });

  // ---------- 駅ナンバリング（番号の計算と表示はステップ12） ----------
  const nEnabled = checkInput({ label: t('numbering.enabled'), onChange: (v) => setNumbering({ enabled: v }) });
  const nPrefix = textInput({ onChange: (v) => setNumbering({ prefix: v.trim() }), maxLength: 4 });
  const nSep = textInput({ onChange: (v) => setNumbering({ separator: v }), maxLength: 2 });
  const nStart = numberInput({ step: 1, min: 0, onChange: (v) => { if (v !== null) setNumbering({ start: Math.round(v) }); } });
  const nStep = numberInput({ step: 1, min: 1, onChange: (v) => { if (v !== null && v >= 1) setNumbering({ step: Math.round(v) }); } });
  const nDigits = numberInput({ step: 1, min: 1, max: 4, onChange: (v) => { if (v !== null && v >= 1) setNumbering({ digits: Math.min(4, Math.round(v)) }); } });
  const nFromEnd = checkInput({ label: t('numbering.fromEnd'), onChange: (v) => setNumbering({ fromEnd: v }) });
  const numberingBody = h('div', {},
    h('div', { class: 'field-row' },
      field(t('numbering.prefix'), nPrefix),
      field(t('numbering.separator'), nSep),
    ),
    h('div', { class: 'field-row' },
      field(t('numbering.start'), nStart),
      field(t('numbering.step'), nStep),
      field(t('numbering.digits'), nDigits),
    ),
    nFromEnd,
  );

  // ---------- 区間の既定値 ----------
  const gauge = gaugeInput({ candidates: GAUGE_CANDIDATES, labels: gaugeLabels(), onChange: (v) => { if (v !== undefined) setDefaults({ gauge: v }); } });
  const elec = selectInput({ options: enumOptions(ELECTRIFICATIONS, (v) => t('electrification.' + v)), onChange: (v) => setDefaults({ electrification: v }) });
  const coll = selectInput({ options: enumOptions(COLLECTIONS, (v) => t('collection.' + v)), onChange: (v) => setDefaults({ collection: v }) });
  const tracks = selectInput({ options: enumOptions(TRACKS, (v) => t('tracks.' + v)), onChange: (v) => setDefaults({ tracks: Number(v) }) });
  const maxSpeed = numberInput({ step: 5, min: 1, onChange: (v) => { if (v !== null && v > 0) setDefaults({ maxSpeed: Math.round(v) }); } });
  const structure = selectInput({ options: enumOptions(STRUCTURES, (v) => t('structure.' + v)), onChange: (v) => setDefaults({ structure: v }) });

  // ---------- 駅の一覧 ----------
  const stopList = h('ol', { class: 'stop-list' });

  const el = h('div', {},
    h('div', { class: 'panel-head' }, title),
    group(t('panel.basic'), [
      h('div', { class: 'field-row field-row-end' }, field(t('line.operator'), operator), editOperator),
      field(t('line.name'), name),
      field(t('line.displayName'), displayName, { hint: t('line.displayNameHint') }),
      field(t('common.nameEn'), nameEn),
      h('div', { class: 'field-row' },
        field(t('line.kind'), kind),
        field(t('line.symbol'), symbol),
      ),
      field(t('line.color'), color),
      loop,
    ]),
    group(t('numbering.title'), [nEnabled, numberingBody], { collapsible: true }),
    group(t('line.defaultsTitle'), [
      field(t('section.gauge'), gauge),
      h('div', { class: 'field-row' },
        field(t('section.electrification'), elec),
        field(t('section.collection'), coll),
      ),
      h('div', { class: 'field-row' },
        field(t('section.tracks'), tracks),
        field(t('section.maxSpeed'), maxSpeed),
      ),
      field(t('section.structure'), structure),
    ], { collapsible: true }),
    group(t('line.more'), [
      field(t('line.upDirection'), upDir),
      field(t('line.status'), status),
      h('div', { class: 'field-row' },
        field(t('common.openedYear'), opened),
        field(t('common.closedYear'), closed),
      ),
      field(t('common.note'), note),
    ], { collapsible: true }),
    group(t('line.stops'), [stopList], { collapsible: true }),
    h('div', { class: 'panel-section' },
      h('div', { class: 'panel-actions' },
        h('button', {
          class: 'btn btn-small',
          type: 'button',
          on: {
            click: () => {
              const id = store.dispatch({ type: 'line/duplicate', lineId });
              es.set({ selection: { type: 'line', lineId: id } });
            },
          },
        }, t('line.duplicate')),
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
      operator.setOptions([
        ...p.operators.map((o) => ({ value: o.id, label: o.name })),
        { value: NEW_OPERATOR, label: t('line.newOperator') },
      ]);
      operator.setValue(line.operatorId);
      name.setValue(line.name);
      displayName.setValue(line.displayName || '');
      nameEn.setValue(line.names.en || '');
      kind.setValue(line.kind);
      color.setValue(line.color);
      symbol.setValue(line.symbol);
      upDir.setValue(line.upDirection);
      loop.setValue(line.isLoop);
      status.setValue(line.status);
      opened.setValue(line.openedYear);
      closed.setValue(line.closedYear);
      note.setValue(line.note || '');

      const n = line.numbering;
      nEnabled.setValue(n.enabled);
      numberingBody.hidden = !n.enabled;
      nPrefix.setValue(n.prefix);
      nPrefix.placeholder = line.symbol || '';
      nSep.setValue(n.separator);
      nStart.setValue(n.start);
      nStep.setValue(n.step);
      nDigits.setValue(n.digits);
      nFromEnd.setValue(n.fromEnd);

      const d = line.defaults;
      gauge.setValue(d.gauge);
      elec.setValue(d.electrification);
      coll.setValue(d.collection);
      tracks.setValue(String(d.tracks));
      maxSpeed.setValue(d.maxSpeed);
      structure.setValue(d.structure);

      const byId = new Map(p.stations.map((s) => [s.id, s]));
      stopList.replaceChildren(...line.stops.map((s) => {
        const st = byId.get(s.stationId);
        return h('li', {}, h('button', {
          class: 'link-btn',
          type: 'button',
          on: { click: () => es.set({ selection: { type: 'stations', ids: [s.stationId] } }) },
        }, (st && st.name) || t('station.unnamed')));
      }));
    },
  };
}
