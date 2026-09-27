// 確認ダイアログと入力ダイアログ（<dialog> を使う）
import { h } from './dom.js';
import { t } from '../i18n/i18n.js';

/**
 * @typedef {object} DialogAction
 * @property {string} label
 * @property {string} value
 * @property {'primary'|'danger'|'default'} [kind]
 */

/**
 * ダイアログを開き、押されたボタンの value を返す（閉じただけなら null）
 * @param {{
 *   title: string,
 *   message?: string,
 *   body?: Node | Node[],
 *   actions: DialogAction[],
 *   onSubmit?: (value: string) => boolean | void,
 * }} opt onSubmit が false を返したら閉じない（入力の検査に使う）
 * @returns {Promise<string | null>}
 */
export function openDialog(opt) {
  return new Promise((resolve) => {
    const form = h('form', { method: 'dialog' });
    const titleId = 'dlg-title-' + Math.random().toString(36).slice(2, 8);
    const dlg = h('dialog', { class: 'dialog', 'aria-labelledby': titleId },
      form,
    );
    form.append(
      h('div', { class: 'dialog-body' },
        h('h2', { class: 'dialog-title', id: titleId }, opt.title),
        opt.message ? h('p', { class: 'dialog-message' }, opt.message) : null,
        opt.body || null,
      ),
      h('div', { class: 'dialog-actions' },
        // キャンセルは type=button にして、入力欄で Enter を押したときに選ばれないようにする
        opt.actions.map((a) => h('button', {
          class: ['btn', a.kind === 'primary' ? 'btn-primary' : a.kind === 'danger' ? 'btn-danger' : ''],
          value: a.value,
          type: a.value === 'cancel' ? 'button' : 'submit',
          on: a.value === 'cancel' ? { click: () => finish(null) } : undefined,
        }, a.label)),
      ),
    );
    let finished = false;
    /** @param {string | null} value */
    const finish = (value) => {
      if (finished) return;
      finished = true;
      if (dlg.open) dlg.close();
      dlg.remove();
      resolve(value);
    };
    // close イベントは画面が隠れていると遅れることがあるため、送信の時点で結果を返す
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const submitter = /** @type {HTMLButtonElement|null} */ (/** @type {SubmitEvent} */ (e).submitter);
      const value = submitter ? submitter.value : (opt.actions.find((a) => a.kind === 'primary') || opt.actions[0]).value;
      if (value !== 'cancel' && opt.onSubmit && opt.onSubmit(value) === false) return;
      finish(value === 'cancel' ? null : value);
    });
    dlg.addEventListener('cancel', () => finish(null));
    dlg.addEventListener('close', () => finish(null));
    document.body.append(dlg);
    dlg.showModal();
    const first = dlg.querySelector('input, select, textarea');
    if (first) /** @type {HTMLElement} */ (first).focus();
  });
}

/**
 * はい／いいえの確認
 * @param {{ title: string, message?: string, okLabel?: string, danger?: boolean }} opt
 */
export async function confirmDialog(opt) {
  const v = await openDialog({
    title: opt.title,
    message: opt.message,
    actions: [
      { label: t('common.cancel'), value: 'cancel' },
      { label: opt.okLabel || t('common.ok'), value: 'ok', kind: opt.danger ? 'danger' : 'primary' },
    ],
  });
  return v === 'ok';
}

/**
 * 文字を1つ入力してもらう
 * @param {{ title: string, label: string, value?: string, okLabel?: string, required?: boolean }} opt
 * @returns {Promise<string | null>}
 */
export async function promptDialog(opt) {
  const input = /** @type {HTMLInputElement} */ (h('input', { class: 'input', type: 'text', value: opt.value || '', autocomplete: 'off' }));
  const err = h('p', { class: 'field-error', hidden: true });
  const body = h('label', { class: 'field' }, h('span', { class: 'field-label' }, opt.label), input, err);
  const v = await openDialog({
    title: opt.title,
    body,
    actions: [
      { label: t('common.cancel'), value: 'cancel' },
      { label: opt.okLabel || t('common.ok'), value: 'ok', kind: 'primary' },
    ],
    onSubmit: () => {
      if (opt.required && !input.value.trim()) {
        err.textContent = t('error.nameRequired');
        err.hidden = false;
        input.focus();
        return false;
      }
      return true;
    },
  });
  return v === 'ok' ? input.value.trim() : null;
}
