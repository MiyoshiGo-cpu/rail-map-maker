// パネルの入力部品。値は change のときに onChange で渡す。
// setValue は、入力中（フォーカス中）の欄は書き換えない。
import { h } from './dom.js';
import { normalizeHex } from '../core/color.js';

let uid = 0;
const nextId = () => `f${++uid}`;

/**
 * ラベル付きの欄
 * @param {string} label
 * @param {HTMLElement} control
 * @param {{ hint?: string }} [opt]
 */
export function field(label, control, opt = {}) {
  const id = control.id || (control.id = nextId());
  return h('div', { class: 'field' },
    h('label', { class: 'field-label', for: id }, label),
    control,
    opt.hint ? h('span', { class: 'field-hint' }, opt.hint) : null,
  );
}

function focused(el) {
  return document.activeElement === el;
}

/**
 * @param {{ value?: string, onChange: (v: string) => void, placeholder?: string, maxLength?: number, inputMode?: string, lang?: string }} opt
 */
export function textInput(opt) {
  const el = /** @type {HTMLInputElement & { setValue(v: string): void }} */ (h('input', {
    class: 'input',
    type: 'text',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: opt.placeholder || null,
    maxlength: opt.maxLength || null,
    inputmode: opt.inputMode || null,
    lang: opt.lang || null,
  }));
  el.value = opt.value ?? '';
  el.addEventListener('change', () => opt.onChange(el.value));
  el.setValue = (v) => {
    if (!focused(el)) el.value = v ?? '';
  };
  return el;
}

/**
 * @param {{ value?: string, onChange: (v: string) => void, rows?: number }} opt
 */
export function textArea(opt) {
  const el = /** @type {HTMLTextAreaElement & { setValue(v: string): void }} */ (h('textarea', { class: 'textarea', rows: opt.rows || 3 }));
  el.value = opt.value ?? '';
  el.addEventListener('change', () => opt.onChange(el.value));
  el.setValue = (v) => {
    if (!focused(el)) el.value = v ?? '';
  };
  return el;
}

/**
 * 数値。空欄は null
 * @param {{ value?: number | null, onChange: (v: number | null) => void, min?: number, max?: number, step?: number | string }} opt
 */
export function numberInput(opt) {
  const el = /** @type {HTMLInputElement & { setValue(v: number | null | undefined): void }} */ (h('input', {
    class: 'input num',
    type: 'number',
    inputmode: 'decimal',
    min: opt.min ?? null,
    max: opt.max ?? null,
    step: opt.step ?? 'any',
  }));
  el.value = opt.value === null || opt.value === undefined ? '' : String(opt.value);
  el.addEventListener('change', () => {
    const v = el.value.trim() === '' ? null : Number(el.value);
    opt.onChange(v === null || Number.isFinite(v) ? v : null);
  });
  el.setValue = (v) => {
    if (!focused(el)) el.value = v === null || v === undefined ? '' : String(v);
  };
  return el;
}

/**
 * @param {{ value?: string, options: { value: string, label: string }[], onChange: (v: string) => void }} opt
 */
export function selectInput(opt) {
  const el = /** @type {HTMLSelectElement & { setValue(v: string): void, setOptions(o: { value: string, label: string }[]): void }} */ (h('select', { class: 'select' }));
  el.setOptions = (options) => {
    const cur = el.value;
    el.replaceChildren(...options.map((o) => h('option', { value: o.value }, o.label)));
    el.value = cur;
  };
  el.setOptions(opt.options);
  el.value = opt.value ?? '';
  el.addEventListener('change', () => opt.onChange(el.value));
  el.setValue = (v) => {
    if (!focused(el)) el.value = v ?? '';
  };
  return el;
}

/**
 * @param {{ label: string, checked?: boolean, onChange: (v: boolean) => void }} opt
 */
export function checkInput(opt) {
  const input = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox' }));
  input.checked = !!opt.checked;
  input.addEventListener('change', () => opt.onChange(input.checked));
  const el = /** @type {HTMLLabelElement & { setValue(v: boolean): void }} */ (h('label', { class: 'check' }, input, h('span', {}, opt.label)));
  el.setValue = (v) => {
    input.checked = !!v;
  };
  return el;
}

/**
 * 色（カラーピッカーと16進数の入力）
 * @param {{ value?: string, onChange: (v: string) => void, label?: string }} opt
 */
export function colorInput(opt) {
  const picker = /** @type {HTMLInputElement} */ (h('input', { type: 'color', 'aria-label': opt.label || null }));
  const text = /** @type {HTMLInputElement} */ (h('input', { class: 'input', type: 'text', maxlength: 7, autocomplete: 'off', spellcheck: 'false' }));
  const set = (v) => {
    const c = normalizeHex(v) || '#000000';
    picker.value = c.toLowerCase();
    if (!focused(text)) text.value = c;
  };
  set(opt.value);
  picker.addEventListener('change', () => {
    const c = normalizeHex(picker.value);
    if (c) opt.onChange(c);
  });
  text.addEventListener('change', () => {
    const c = normalizeHex(text.value);
    if (c) opt.onChange(c);
    else set(picker.value);
  });
  const el = /** @type {HTMLDivElement & { setValue(v: string): void, input: HTMLInputElement }} */ (h('div', { class: 'color-field' }, picker, text));
  el.setValue = set;
  el.input = text;
  return el;
}

/**
 * 見出し付きのまとまり。collapsible なら開閉できる（details）
 * @param {string} title
 * @param {any[]} children
 * @param {{ collapsible?: boolean, open?: boolean }} [opt]
 */
export function group(title, children, opt = {}) {
  if (opt.collapsible) {
    const d = h('details', { class: 'panel-section panel-group' },
      h('summary', {}, title),
      h('div', { class: 'panel-group-body' }, children),
    );
    if (opt.open) d.setAttribute('open', '');
    return d;
  }
  return h('div', { class: 'panel-section' }, h('h3', {}, title), children);
}

/**
 * 列挙値の選択肢（表示名はカタログの「prefix + 値」）
 * @param {readonly (string|number)[]} values
 * @param {(v: string) => string} label
 */
export function enumOptions(values, label) {
  return values.map((v) => ({ value: String(v), label: label(String(v)) }));
}

/**
 * 軌間：候補から選ぶか数値を入れる。null は対象外（モノレール等）
 * @param {{
 *   candidates: number[],
 *   onChange: (v: number | null | undefined) => void,
 *   labels: { none: string, other: string, mm: (v: number) => string, inherit?: string },
 *   allowNone?: boolean,
 * }} opt inherit を渡すと「路線の既定」を選べる（undefined を返す）。allowNone が false なら「対象外」を出さない
 */
export function gaugeInput(opt) {
  const opts = [];
  if (opt.labels.inherit) opts.push({ value: 'inherit', label: opt.labels.inherit });
  for (const c of opt.candidates) opts.push({ value: String(c), label: opt.labels.mm(c) });
  if (opt.allowNone !== false) opts.push({ value: 'none', label: opt.labels.none });
  opts.push({ value: 'other', label: opt.labels.other });
  const num = numberInput({
    min: 100,
    max: 3000,
    step: 1,
    onChange: (v) => {
      if (v !== null && v > 0) opt.onChange(Math.round(v));
    },
  });
  const sel = selectInput({
    options: opts,
    onChange: (v) => {
      num.hidden = v !== 'other';
      if (v === 'inherit') opt.onChange(undefined);
      else if (v === 'none') opt.onChange(null);
      else if (v === 'other') num.focus();
      else opt.onChange(Number(v));
    },
  });
  const el = /** @type {HTMLDivElement & { setValue(v: number | null | undefined): void, setInheritLabel(s: string): void }} */ (h('div', { class: 'gauge-field' }, sel, num));
  el.setInheritLabel = (text) => {
    const o = sel.querySelector('option[value="inherit"]');
    if (o) o.textContent = text;
  };
  el.setValue = (v) => {
    let key;
    if (v === undefined) key = opt.labels.inherit ? 'inherit' : 'none';
    else if (v === null) key = 'none';
    else key = opt.candidates.includes(v) ? String(v) : 'other';
    sel.setValue(key);
    num.hidden = key !== 'other';
    if (key === 'other') num.setValue(v);
  };
  return el;
}
