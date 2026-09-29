// 駅のパネル（§3 Station の全項目と、路線図での駅名ラベルの設定）
import { h } from '../dom.js';
import { t } from '../../i18n/i18n.js';
import { STATION_RANKS, STATION_STRUCTURES, PLATFORM_TYPES, FACILITIES, LABEL_POSITIONS, LABEL_ORIENTATIONS } from '../../core/schema.js';
import { getRegion } from '../../core/regions/index.js';
import { field, textInput, textArea, selectInput, numberInput, checkInput, group, enumOptions } from '../form.js';

/**
 * @param {{ store: any, es: any, onDelete: (ids: string[]) => void }} ctx
 * @param {string} stationId
 */
export function createStationPanel(ctx, stationId) {
  const { store, es } = ctx;
  const cur = () => store.getState().stations.find((s) => s.id === stationId);
  const set = (fields) => store.dispatch({ type: 'station/update', stationId, fields });
  const opt = (v) => (v.trim() ? v.trim() : undefined);
  const int = (v) => (v === null ? undefined : Math.round(v));
  const region = getRegion(store.getState().locale.region);

  const title = h('h2', { class: 'panel-title' });
  const lineChips = h('ul', { class: 'chip-list' });

  // ---------- 基本 ----------
  const name = textInput({ onChange: (v) => set({ name: v.trim() }) });
  const reading = textInput({ onChange: (v) => set({ reading: v.trim() }), inputMode: 'kana' });
  const nameEn = textInput({ onChange: (v) => set({ names: { ...cur().names, en: opt(v) } }), lang: 'en' });
  const autoRomanize = checkInput({ label: t('station.autoRomanize'), onChange: (v) => set({ autoRomanize: v }) });
  const subName = textInput({ onChange: (v) => set({ subName: opt(v) }) });
  const rank = selectInput({ options: enumOptions(STATION_RANKS, (v) => t('rank.' + v)), onChange: (v) => set({ rank: v }) });

  // ---------- 詳しい設定 ----------
  const code3 = textInput({ onChange: (v) => set({ code3: opt(v.toUpperCase()) }), maxLength: 3 });
  const structure = selectInput({ options: enumOptions(STATION_STRUCTURES, (v) => t('structure.' + v)), onChange: (v) => set({ structure: v }) });
  const setPlatforms = (patch) => {
    const p = cur().platforms || { type: 'island', faces: 1, tracks: 2 };
    set({ platforms: { ...p, ...patch } });
  };
  const pfType = selectInput({
    options: [{ value: '', label: t('common.unset') }, ...enumOptions(PLATFORM_TYPES, (v) => t('platform.' + v))],
    onChange: (v) => (v ? setPlatforms({ type: v }) : set({ platforms: undefined })),
  });
  const pfFaces = numberInput({ step: 1, min: 1, max: 20, onChange: (v) => { if (v !== null && v >= 1) setPlatforms({ faces: Math.round(v) }); } });
  const pfTracks = numberInput({ step: 1, min: 1, max: 40, onChange: (v) => { if (v !== null && v >= 1) setPlatforms({ tracks: Math.round(v) }); } });
  const pfNumbers = h('div', { class: 'field-row' }, field(t('platform.faces'), pfFaces), field(t('platform.tracks'), pfTracks));
  const facilities = FACILITIES.map((f) => ({
    f,
    el: checkInput({
      label: t('facility.' + f),
      onChange: (v) => {
        const list = cur().facilities.filter((x) => x !== f);
        if (v) list.push(f);
        set({ facilities: FACILITIES.filter((x) => list.includes(x)) });
      },
    }),
  }));
  const managedBy = selectInput({ options: [], onChange: (v) => set({ managedBy: v || undefined }) });
  const admin1 = textInput({ onChange: (v) => set({ admin1: opt(v) }) });
  const admin2 = textInput({ onChange: (v) => set({ admin2: opt(v) }) });
  const fareZone = textInput({ onChange: (v) => set({ fareZone: opt(v) }), maxLength: 8 });
  const opened = numberInput({ step: 1, onChange: (v) => set({ openedYear: int(v) }) });
  const closed = numberInput({ step: 1, onChange: (v) => set({ closedYear: int(v) }) });
  const ridership = numberInput({ step: 1, min: 0, onChange: (v) => set({ ridership: v === null ? undefined : Math.max(0, Math.round(v)) }) });
  const note = textArea({ onChange: (v) => set({ note: opt(v) }) });

  // ---------- 駅名ラベル（路線図） ----------
  const setLabel = (fields) => store.dispatch({ type: 'station/label', stationId, fields });
  const lPos = selectInput({ options: enumOptions(LABEL_POSITIONS, (v) => t('labelPos.' + v)), onChange: (v) => setLabel({ pos: v }) });
  const lOrient = selectInput({ options: enumOptions(LABEL_ORIENTATIONS, (v) => t('labelOrientation.' + v)), onChange: (v) => setLabel({ orientation: v }) });
  const lText = textArea({ rows: 2, onChange: (v) => setLabel({ text: v.trim() ? v.replace(/\s+$/, '') : undefined }) });
  const lHidden = checkInput({ label: t('label.hidden'), onChange: (v) => setLabel({ hidden: v }) });
  const lReset = h('button', { class: 'btn btn-small', type: 'button', on: { click: () => setLabel({ dx: undefined, dy: undefined }) } }, t('label.resetOffset'));

  const el = h('div', {},
    h('div', { class: 'panel-head' }, title),
    h('div', { class: 'panel-section' }, lineChips),
    group(t('panel.basic'), [
      field(t('station.name'), name),
      field(t('station.reading'), reading, { hint: t('station.readingHint') }),
      field(t('common.nameEn'), nameEn),
      autoRomanize,
      field(t('station.subName'), subName),
      field(t('station.rank'), rank),
    ]),
    group(t('label.title'), [
      h('div', { class: 'field-row' },
        field(t('label.position'), lPos),
        field(t('label.orientation'), lOrient),
      ),
      field(t('label.text'), lText, { hint: t('label.textHint') }),
      lHidden,
      h('p', { class: 'panel-note' }, t('label.dragHint')),
      h('div', { class: 'panel-actions' }, lReset),
    ], { collapsible: true }),
    group(t('panel.details'), [
      h('div', { class: 'field-row' },
        field(t('station.code3'), code3),
        field(t('station.structure'), structure),
      ),
      field(t('platform.title'), pfType),
      pfNumbers,
      h('fieldset', { class: 'field fieldset' },
        h('legend', { class: 'field-label' }, t('station.facilities')),
        facilities.map((x) => x.el),
      ),
      field(t('station.managedBy'), managedBy),
      h('div', { class: 'field-row' },
        field(t(region.adminLabelKeys.admin1), admin1),
        field(t(region.adminLabelKeys.admin2), admin2),
      ),
      field(t('station.fareZone'), fareZone),
      h('div', { class: 'field-row' },
        field(t('common.openedYear'), opened),
        field(t('common.closedYear'), closed),
      ),
      field(t('station.ridership'), ridership, { hint: t('station.ridershipHint') }),
      field(t('common.note'), note),
    ], { collapsible: true }),
    h('div', { class: 'panel-section' },
      h('div', { class: 'panel-actions' },
        h('button', { class: 'btn btn-small', type: 'button', on: { click: () => ctx.onDelete([stationId]) } }, t('station.delete')),
      ),
    ),
  );

  return {
    el,
    /** @param {import('../../core/schema.js').Project} p */
    update(p) {
      const st = p.stations.find((s) => s.id === stationId);
      if (!st) return;
      title.textContent = st.name || t('station.unnamed');
      name.setValue(st.name);
      reading.setValue(st.reading || '');
      nameEn.setValue(st.names.en || '');
      // 自動で作る間は英字を手で書き換えない
      nameEn.disabled = st.autoRomanize;
      autoRomanize.setValue(st.autoRomanize);
      subName.setValue(st.subName || '');
      rank.setValue(st.rank);
      code3.setValue(st.code3 || '');
      structure.setValue(st.structure);
      pfType.setValue(st.platforms ? st.platforms.type : '');
      pfNumbers.hidden = !st.platforms;
      pfFaces.setValue(st.platforms ? st.platforms.faces : null);
      pfTracks.setValue(st.platforms ? st.platforms.tracks : null);
      for (const x of facilities) x.el.setValue(st.facilities.includes(x.f));
      managedBy.setOptions([{ value: '', label: t('common.none') }, ...p.operators.map((o) => ({ value: o.id, label: o.name }))]);
      managedBy.setValue(st.managedBy || '');
      admin1.setValue(st.admin1 || '');
      admin2.setValue(st.admin2 || '');
      fareZone.setValue(st.fareZone || '');
      opened.setValue(st.openedYear);
      closed.setValue(st.closedYear);
      ridership.setValue(st.ridership);
      note.setValue(st.note || '');
      const lb = st.label.schematic;
      lPos.setValue(lb.pos);
      lOrient.setValue(lb.orientation);
      lText.setValue(lb.text || '');
      lText.placeholder = st.name;
      // 信号場は既定で駅名を出さない
      lHidden.setValue(lb.hidden === true || (st.rank === 'signal' && lb.hidden !== false));
      lReset.disabled = !lb.dx && !lb.dy;

      const lines = p.lines.filter((l) => l.stops.some((s) => s.stationId === stationId)).sort((a, b) => a.order - b.order);
      lineChips.replaceChildren(...(lines.length
        ? lines.map((l) => h('li', {}, h('button', {
          class: 'chip',
          type: 'button',
          style: { '--chip': l.color },
          on: { click: () => es.set({ selection: { type: 'line', lineId: l.id } }) },
        }, l.displayName || l.name)))
        : [h('li', { class: 'panel-note' }, t('station.noLines'))]));
    },
    focusName() {
      name.focus();
      name.select();
    },
  };
}
