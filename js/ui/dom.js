// 小さな DOM ヘルパー

/**
 * 要素を作る。props の特別なキー：class, style(object), dataset, on(イベント), text, html は使わない
 * @param {string} tag
 * @param {Record<string, any>} [props]
 * @param {...(Node|string|number|null|undefined|false|Array<any>)} children
 * @returns {HTMLElement}
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
    else if (k === 'style' && typeof v === 'object') {
      // '--名前' の CSS 変数は setProperty でないと入らない
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, String(sv));
        else el.style[sk] = sv;
      }
    }
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'text') el.textContent = String(v);
    else if (k in el && typeof v !== 'string' && k !== 'list') el[k] = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

/**
 * 子要素を追加する（配列・null を許す）
 * @param {Element} el
 * @param {any[]} children
 */
export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
}

/** @param {Element} el */
export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/**
 * 中身を差し替える
 * @param {Element} el
 * @param {...any} children
 */
export function replaceChildren(el, ...children) {
  clear(el);
  append(el, children);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * SVG アイコンを作る
 * @param {string} d path の d 属性（複数は | 区切り）
 * @param {{ fill?: boolean }} [opt]
 */
export function svgPath(d, opt = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const part of d.split('|')) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', part);
    if (opt.fill) {
      p.setAttribute('fill', 'currentColor');
    } else {
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', 'currentColor');
      p.setAttribute('stroke-width', '2');
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
    }
    svg.append(p);
  }
  return svg;
}
