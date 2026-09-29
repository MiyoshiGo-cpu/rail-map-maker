// 付帯施設の小さなマーク（§5.2：空港・港・バスターミナル）。size 四方の箱に描く

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} kind
 * @param {number} x 左上
 * @param {number} y
 * @param {number} size
 * @param {string} color
 * @param {string} [bg] 地の色（白抜き部分）
 */
export function drawPictogram(ctx, kind, x, y, size, color, bg = '#FFFFFF') {
  const k = size / 24;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (kind) {
    case 'airport':
      // 上向きの飛行機
      ctx.beginPath();
      ctx.moveTo(12, 1.5);
      ctx.quadraticCurveTo(13.6, 2.5, 13.6, 6);
      ctx.lineTo(13.6, 9);
      ctx.lineTo(22.5, 14);
      ctx.lineTo(22.5, 16);
      ctx.lineTo(13.6, 13.5);
      ctx.lineTo(13.2, 18.5);
      ctx.lineTo(16, 20.5);
      ctx.lineTo(16, 22.5);
      ctx.lineTo(12, 21.3);
      ctx.lineTo(8, 22.5);
      ctx.lineTo(8, 20.5);
      ctx.lineTo(10.8, 18.5);
      ctx.lineTo(10.4, 13.5);
      ctx.lineTo(1.5, 16);
      ctx.lineTo(1.5, 14);
      ctx.lineTo(10.4, 9);
      ctx.lineTo(10.4, 6);
      ctx.quadraticCurveTo(10.4, 2.5, 12, 1.5);
      ctx.closePath();
      ctx.fill();
      break;
    case 'port':
      // いかり
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(12, 4.5, 2.4, 0, Math.PI * 2);
      ctx.moveTo(12, 7);
      ctx.lineTo(12, 21.5);
      ctx.moveTo(7.5, 10.5);
      ctx.lineTo(16.5, 10.5);
      ctx.moveTo(3.5, 14);
      ctx.quadraticCurveTo(4.5, 21.5, 12, 21.5);
      ctx.quadraticCurveTo(19.5, 21.5, 20.5, 14);
      ctx.stroke();
      break;
    case 'busTerminal':
      // 正面から見たバス
      ctx.beginPath();
      ctx.roundRect(4, 2, 16, 18, 3);
      ctx.fill();
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.roundRect(6.2, 4.6, 11.6, 7, 1);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(8, 15.5, 1.5, 0, Math.PI * 2);
      ctx.arc(16, 15.5, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillRect(5.5, 20, 3.5, 2.5);
      ctx.fillRect(15, 20, 3.5, 2.5);
      break;
    default:
      break;
  }
  ctx.restore();
}

/**
 * 同じマークを SVG の要素にする（書き出し用）
 * @param {string} kind
 * @param {number} x 左上
 * @param {number} y
 * @param {number} size
 * @param {string} color
 * @param {string} [bg]
 * @param {(v: number) => string} [num] 数の書き方
 * @returns {string}
 */
export function pictogramSvg(kind, x, y, size, color, bg = '#FFFFFF', num = String) {
  const k = size / 24;
  const g = (body) => `<g transform="translate(${num(x)} ${num(y)}) scale(${num(k)})">${body}</g>`;
  switch (kind) {
    case 'airport':
      return g(`<path d="M12 1.5Q13.6 2.5 13.6 6L13.6 9L22.5 14L22.5 16L13.6 13.5L13.2 18.5L16 20.5L16 22.5L12 21.3L8 22.5L8 20.5L10.8 18.5L10.4 13.5L1.5 16L1.5 14L10.4 9L10.4 6Q10.4 2.5 12 1.5Z" fill="${color}"/>`);
    case 'port':
      return g(`<path d="M14.4 4.5A2.4 2.4 0 1 1 9.6 4.5A2.4 2.4 0 1 1 14.4 4.5M12 7L12 21.5M7.5 10.5L16.5 10.5M3.5 14Q4.5 21.5 12 21.5Q19.5 21.5 20.5 14" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`);
    case 'busTerminal':
      return g(`<rect x="4" y="2" width="16" height="18" rx="3" fill="${color}"/>`
        + `<rect x="6.2" y="4.6" width="11.6" height="7" rx="1" fill="${bg}"/>`
        + `<circle cx="8" cy="15.5" r="1.5" fill="${bg}"/><circle cx="16" cy="15.5" r="1.5" fill="${bg}"/>`
        + `<rect x="5.5" y="20" width="3.5" height="2.5" fill="${color}"/><rect x="15" y="20" width="3.5" height="2.5" fill="${color}"/>`);
    default:
      return '';
  }
}
