// 画面下の短い通知
import { h } from './dom.js';

let host = null;

function getHost() {
  if (!host || !host.isConnected) {
    host = h('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' });
    document.body.append(host);
  }
  return host;
}

/**
 * @param {string} message
 * @param {{ kind?: 'info'|'error', ms?: number }} [opt]
 */
export function toast(message, opt = {}) {
  const el = h('div', { class: 'toast', dataset: { kind: opt.kind || 'info' } }, message);
  getHost().append(el);
  const ms = opt.ms ?? (opt.kind === 'error' ? 6000 : 2500);
  setTimeout(() => el.remove(), ms);
  return el;
}
