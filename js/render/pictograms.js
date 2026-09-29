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
