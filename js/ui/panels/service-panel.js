// 運行系統のパネル（§3 Service）：経路と区間ごとの種別、停車駅、本数・両数・両方向運転、所要時間・表定速度・停車駅数
import { h } from '../dom.js';
import { t, formatDuration } from '../../i18n/i18n.js';
import { expandService, stopFlags, stopIds, throughJoints } from '../../core/services.js';
import { serviceRuntime } from '../../core/runtime.js';
import { field, textInput, textArea, numberInput, checkInput, colorInput, selectInput, group } from '../form.js';
import { createRoutePicker } from '../route-picker.js';
import { serviceLabel, serviceColor, typeOptions, runtimeSummary } from '../service-ui.js';

const FREQ_KEYS = ['morning', 'day', 'evening', 'night'];

/**
 * @param {{ store: any, es: any, toast: (m: string) => void }} ctx
 * @param {string} serviceId
 */
export function createServicePanel(ctx, serviceId) {
  const { store, es } = ctx;
  const cur = () => store.getState().services.find((x) => x.id === serviceId);
  const set = (fields) => store.dispatch({ type: 'service/update', serviceId, fields });
  const btn = (label, onClick) => h('button', { class: 'btn btn-small', type: 'button', on: { click: onClick } }, label);

  const title = h('h2', { class: 'panel-title' });
  const routeNote = h('p', { class: 'panel-note' });
  const summary = h('p', { class: 'service-summary' });

  // ---------- 基本 ----------
  const name = textInput({ onChange: (v) => set({ name: v.trim() || undefined }) });
  const color = colorInput({ label: t('common.color'), onChange: (v) => set({ color: v }) });
  const resetColor = btn(t('service.useTypeColor'), () => set({ color: undefined }));

  // ---------- 経路 ----------
  const segList = h('ul', { class: 'segment-list' });
  const reroute = btn(t('service.reroute'), () => {
    const sv = cur();
    const first = sv.segments[0];
    const last = sv.segments[sv.segments.length - 1];
    es.set({ routeDraft: { serviceId, from: first ? first.from : '', to: last ? last.to : '', via: [], typeId: '' } });
  });
  const picker = createRoutePicker(ctx, {
    onPick(route) {
      store.dispatch({ type: 'service/setRoute', serviceId, route });
      es.set({ routeDraft: null, pending: null });
      ctx.toast(t('service.rerouted'));
    },
  });
  const pickerWrap = h('div', { hidden: true },
    picker.el,
    h('div', { class: 'panel-actions' }, btn(t('common.cancel'), () => es.set({ routeDraft: null, pending: null }))),
  );
  const segView = h('div', {}, segList, h('div', { class: 'panel-actions' }, reroute));

  // ---------- 停車駅 ----------
  const auto = checkInput({
    label: t('service.stopsAuto'),
    onChange: (v) => {
      if (v) store.dispatch({ type: 'service/autoStops', serviceId });
      else {
        // いまの停車駅を写してから、手で決める状態にする
        const p = store.getState();
        const path = expandService(p, cur());
        set({ stopsAuto: false, stops: stopIds(path, stopFlags(p, cur(), path)) });
      }
    },
  });
  const stopList = h('ol', { class: 'service-stops' });

  // ---------- 運転 ----------
  const freq = Object.fromEntries(FREQ_KEYS.map((k) => [k, numberInput({
    step: 1,
    min: 0,
    max: 60,
    onChange: (v) => { if (v !== null && v >= 0) set({ frequency: { ...cur().frequency, [k]: Math.round(v) } }); },
  })]));
  const cars = numberInput({ step: 1, min: 1, max: 20, onChange: (v) => set({ cars: v === null ? undefined : Math.max(1, Math.round(v)) }) });
  const both = checkInput({ label: t('service.bothDirections'), onChange: (v) => set({ bothDirections: v }) });
  const note = textArea({ onChange: (v) => set({ note: v.trim() || undefined }) });

  const el = h('div', {},
    h('div', { class: 'panel-head' }, title),
    h('div', { class: 'panel-section' }, routeNote, summary),
    group(t('panel.basic'), [
      field(t('service.name'), name, { hint: t('service.nameHint') }),
      h('div', { class: 'field-row field-row-end' }, field(t('common.color'), color), resetColor),
    ]),
    group(t('service.routeTitle'), [segView, pickerWrap]),
    group(t('service.stopsTitle'), [auto, stopList]),
    group(t('service.operation'), [
      h('p', { class: 'panel-note' }, t('service.frequencyHint')),
      h('div', { class: 'field-row' }, field(t('service.freq.morning'), freq.morning), field(t('service.freq.day'), freq.day)),
      h('div', { class: 'field-row' }, field(t('service.freq.evening'), freq.evening), field(t('service.freq.night'), freq.night)),
      field(t('service.cars'), cars),
      both,
    ]),
    group(t('common.note'), [note], { collapsible: true }),
    h('div', { class: 'panel-section' },
      h('div', { class: 'panel-actions' },
        btn(t('common.duplicate'), () => es.set({ selection: { type: 'service', id: store.dispatch({ type: 'service/duplicate', serviceId }) } })),
        btn(t('service.delete'), () => {
          store.dispatch({ type: 'service/delete', serviceId });
          es.set({ selection: { type: 'none' } });
          ctx.toast(t('service.deleted'));
        }),
      ),
    ),
  );

  let segKey = '';
  let stopKey = '';

  /** 区間の一覧（路線・始発→終着・種別。事業者が変わるところに「直通」） */
  function renderSegments(p, sv) {
    const key = JSON.stringify([sv.segments, p.serviceTypes.map((x) => [x.id, x.name]), p.lines.map((l) => [l.id, l.name, l.displayName, l.color])]);
    if (key === segKey || segList.contains(document.activeElement)) return;
    segKey = key;
    const stName = (id) => p.stations.find((s) => s.id === id)?.name || t('station.unnamed');
    const joints = new Set(throughJoints(p, sv).map((j) => j.seg));
    segList.replaceChildren(...sv.segments.map((seg, i) => {
      const line = p.lines.find((l) => l.id === seg.lineId);
      const type = selectInput({
        options: typeOptions(p, line && line.operatorId),
        onChange: (v) => store.dispatch({ type: 'service/segmentType', serviceId, index: i, typeId: v }),
      });
      type.value = seg.typeId;
      type.setAttribute('aria-label', t('service.segmentType', { line: line ? line.name : '' }));
      return h('li', { class: 'segment-row' },
        joints.has(i) ? h('span', { class: 'through-tag' }, t('service.through')) : null,
        h('span', { class: 'segment-line', style: { '--chip': line ? line.color : '' } }, line ? line.displayName || line.name : ''),
        h('span', { class: 'segment-ends' }, t('service.fromTo', { from: stName(seg.from), to: stName(seg.to) }) + (seg.loopDir ? t('common.dot') + t('loopDir.' + seg.loopDir) : '')),
        type,
      );
    }));
  }

  /** 停車駅の一覧（チェックで停車・通過。始発・終着は外せない。停車駅には始発からの時間） */
  function renderStops(p, sv, path, flags, rt) {
    const key = JSON.stringify([path.stations, flags, sv.stopsAuto, rt && rt.depart.map(Math.round), p.stations.map((s) => s.name)]);
    if (key === stopKey || stopList.contains(document.activeElement)) return;
    stopKey = key;
    const byId = new Map(p.stations.map((s) => [s.id, s]));
    const lineById = new Map(p.lines.map((l) => [l.id, l]));
    const last = path.stations.length - 1;
    const rows = [];
    path.stations.forEach((id, k) => {
      // 区間の始まりに路線名の見出し
      const seg = path.segs.findIndex((r) => r.start === k && r.end > k);
      if (seg >= 0) {
        const line = lineById.get(sv.segments[seg].lineId);
        rows.push(h('li', { class: 'service-stops-line', style: { '--chip': line ? line.color : '' } }, line ? line.displayName || line.name : ''));
      }
      const input = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox' }));
      input.checked = flags[k];
      input.disabled = k === 0 || k === last;
      input.addEventListener('change', () => store.dispatch({ type: 'service/setStop', serviceId, stationId: id, stop: input.checked }));
      rows.push(h('li', { class: ['service-stop', flags[k] ? 'is-stop' : 'is-pass'] },
        h('label', { class: 'check' }, input, h('span', {}, byId.get(id)?.name || t('station.unnamed'))),
        h('span', { class: 'service-stop-time num' }, k === 0 ? t('service.origin') : flags[k] && rt ? formatDuration(rt.depart[k]) : flags[k] ? '' : t('service.pass')),
      ));
    });
    stopList.replaceChildren(...rows);
  }

  return {
    el,
    /** @param {import('../../core/schema.js').Project} p */
    update(p) {
      const sv = p.services.find((x) => x.id === serviceId);
      if (!sv) return;
      const path = expandService(p, sv);
      const flags = stopFlags(p, sv, path);
      const rt = serviceRuntime(p, sv, { path, flags });
      title.textContent = serviceLabel(p, sv);
      routeNote.textContent = path.ok ? '' : t('service.broken');
      routeNote.hidden = path.ok;
      summary.textContent = runtimeSummary(p, rt);
      name.setValue(sv.name || '');
      color.setValue(serviceColor(p, sv));
      resetColor.disabled = !sv.color;

      const editing = es.get().routeDraft && es.get().routeDraft.serviceId === serviceId;
      segView.hidden = !!editing;
      pickerWrap.hidden = !editing;
      if (editing) picker.update(p);
      else renderSegments(p, sv);

      auto.setValue(sv.stopsAuto);
      renderStops(p, sv, path, flags, rt);
      for (const k of FREQ_KEYS) freq[k].setValue(sv.frequency[k]);
      cars.setValue(sv.cars ?? null);
      both.setValue(sv.bothDirections);
      note.setValue(sv.note || '');
    },
  };
}
