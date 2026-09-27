// 文言の取り出し（t）と、数値・日付・距離の整形
import ja from './ja.js';

/** @type {Record<string, Record<string, string>>} */
const catalogs = { ja };

/** UIの言語として選べるもの（フェーズ8で en を足す） */
export const UI_LANGS = ['ja'];
const FALLBACK = 'ja';
const LANG_KEY = 'rmm:lang';

let uiLang = FALLBACK;
const warned = new Set();

/** 開発中（localhost）かどうか。未登録キーの警告に使う */
const DEV = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

/**
 * 保存されたUIの言語を読み、<html lang> を合わせる
 * @returns {string}
 */
export function initUiLang() {
  let lang = FALLBACK;
  try {
    const saved = globalThis.localStorage && localStorage.getItem(LANG_KEY);
    if (saved && UI_LANGS.includes(saved)) lang = saved;
  } catch {
    // localStorage が使えない環境では既定のまま
  }
  setUiLang(lang);
  return lang;
}

/** @param {string} lang */
export function setUiLang(lang) {
  uiLang = UI_LANGS.includes(lang) ? lang : FALLBACK;
  if (typeof document !== 'undefined') document.documentElement.lang = uiLang;
}

export function getUiLang() {
  return uiLang;
}

/**
 * カタログに言語を追加する（テスト用・フェーズ8用）
 * @param {string} lang
 * @param {Record<string, string>} catalog
 */
export function registerCatalog(lang, catalog) {
  catalogs[lang] = catalog;
}

/**
 * 差し込み：'{name}' を vars.name に置き換える
 * @param {string} s
 * @param {Record<string, any>} [vars]
 */
export function interpolate(s, vars) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
}

/**
 * 指定した言語の文言を取り出す。無ければ日本語、それも無ければキーを返す
 * @param {string} lang
 * @param {string} key
 * @param {Record<string, any>} [vars]
 */
export function translate(lang, key, vars) {
  const base = (lang || FALLBACK).split('-')[0];
  let s = catalogs[base] && catalogs[base][key];
  if (s === undefined) {
    s = catalogs[FALLBACK][key];
    if (DEV && !warned.has(base + ':' + key)) {
      warned.add(base + ':' + key);
      console.warn(`[i18n] カタログにないキー: ${key}（${base}）`);
    }
    if (s === undefined) return key;
  }
  return interpolate(s, vars);
}

/**
 * UIの言語で文言を取り出す
 * @param {string} key
 * @param {Record<string, any>} [vars]
 */
export function t(key, vars) {
  return translate(uiLang, key, vars);
}

/** キーがカタログにあるか */
export function hasKey(key) {
  return catalogs[uiLang][key] !== undefined || catalogs[FALLBACK][key] !== undefined;
}

/**
 * 地図の言語で文言を取り出す関数を作る（凡例・既定の名前など、地図に描く定型文用）
 * @param {string} mapLanguage
 * @returns {(key: string, vars?: Record<string, any>) => string}
 */
export function mapTranslator(mapLanguage) {
  return (key, vars) => translate(mapLanguage, key, vars);
}

// ---------- 数値・日付・距離 ----------

const fmtCache = new Map();
function numberFormat(lang, opts) {
  const k = lang + JSON.stringify(opts || {});
  let f = fmtCache.get(k);
  if (!f) {
    f = new Intl.NumberFormat(lang, opts);
    fmtCache.set(k, f);
  }
  return f;
}

/**
 * @param {number} n
 * @param {Intl.NumberFormatOptions} [opts]
 * @param {string} [lang]
 */
export function formatNumber(n, opts, lang = uiLang) {
  return numberFormat(lang, opts).format(n);
}

/**
 * @param {number} amount
 * @param {string} currency ISO 4217
 * @param {string} [lang]
 */
export function formatCurrency(amount, currency, lang = uiLang) {
  return numberFormat(lang, { style: 'currency', currency }).format(amount);
}

/**
 * @param {string|Date} date
 * @param {string} [lang]
 * @param {Intl.DateTimeFormatOptions} [opts]
 */
export function formatDate(date, lang = uiLang, opts = { dateStyle: 'medium', timeStyle: 'short' }) {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (!d || Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(lang, opts).format(d);
}

export const KM_PER_MILE = 1.609344;

/**
 * 距離を表示用に整える（内部は常に km。表示は0.1単位）
 * @param {number} km
 * @param {'km'|'mi'} unit
 * @param {string} [lang]
 */
export function formatDistance(km, unit = 'km', lang = uiLang) {
  const v = unit === 'mi' ? km / KM_PER_MILE : km;
  const num = numberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
  return translate(lang, unit === 'mi' ? 'unit.mi' : 'unit.km', { value: num });
}
