// Draws the leaderboard as a portrait PNG: flat dark ledger style, serif title,
// hairline dividers, big numerals for the top 3. No glow, no gradients.
const { createCanvas } = require('@napi-rs/canvas');

// ---- Layout (logical px; rendered at SCALE x for crispness) ----
const SCALE = 2;
const W = 900;
const M = 56; // side margin
const HEADER_H = 214;
const TOP_ROW_H = 112; // ranks 1-3
const ROW_H = 80; // everyone else
const FOOTER_H = 84;

// ---- Style ----
const BG = '#121315';
const INK = '#efebe3';
const MUTED = '#8d8a82';
const LINE = 'rgba(239,235,227,0.10)';
const GOLD = '#caa24a';
const MEDAL = ['#caa24a', '#b4b9c1', '#b8825a']; // gold, silver, bronze (muted)

const SANS = '"Segoe UI", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Noto Sans", Inter, Arial, sans-serif';
const SERIF = 'Georgia, Gelasio, "Noto Serif", serif';

// Trim text with "…" so it never overflows its slot
function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  const chars = [...text];
  while (chars.length > 1 && ctx.measureText(chars.join('') + '…').width > maxW) chars.pop();
  return chars.join('') + '…';
}

function spaced(ctx, px) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`;
}

function moneyNumber(cents) {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * @param {object} o
 * @param {Array<{rank:number,name:string,cents:number,avatar:import('@napi-rs/canvas').Image|null}>} o.entries
 * @param {number} o.page         0-based
 * @param {number} o.totalPages
 * @param {number} o.maxCents     (unused in this style, kept so callers don't change)
 * @param {string} o.shopName
 * @returns {Buffer} PNG
 */
function renderLeaderboard({ entries, page, totalPages, shopName }) {
  const rowH = (e) => (e.rank <= 3 ? TOP_ROW_H : ROW_H);
  const rowsH = entries.length ? entries.reduce((s, e) => s + rowH(e), 0) : ROW_H * 3;
  const H = HEADER_H + rowsH + FOOTER_H;

  const canvas = createCanvas(W * SCALE, H * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // ---- Header ----
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = GOLD;
  ctx.font = `600 15px ${SANS}`;
  spaced(ctx, 3);
  ctx.fillText(String(shopName).toUpperCase(), M, 74);

  ctx.textAlign = 'right';
  ctx.fillStyle = MUTED;
  ctx.fillText(`PAGE ${page + 1} / ${totalPages}`, W - M, 74);
  spaced(ctx, 0);
  ctx.textAlign = 'left';

  ctx.fillStyle = INK;
  ctx.font = `700 68px ${SERIF}`;
  ctx.fillText('Leaderboard', M, 148);

  ctx.fillStyle = MUTED;
  ctx.font = `400 18px ${SANS}`;
  ctx.fillText('Ranked by total amount spent', M, 182);

  // Rule with a short gold tab
  ctx.fillStyle = LINE;
  ctx.fillRect(M, HEADER_H - 1, W - M * 2, 1);
  ctx.fillStyle = GOLD;
  ctx.fillRect(M, HEADER_H - 2, 56, 3);

  // ---- Empty state ----
  if (entries.length === 0) {
    ctx.fillStyle = MUTED;
    ctx.font = `400 22px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.fillText('No spending recorded yet', W / 2, HEADER_H + ROW_H * 1.5);
    ctx.textAlign = 'left';
  }

  // ---- Rows ----
  let y = HEADER_H;
  entries.forEach((e, i) => {
    const top = e.rank <= 3;
    const h = rowH(e);
    const cy = y + h / 2;
    const color = top ? MEDAL[e.rank - 1] : MUTED;

    // Rank numeral
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = color;
    const label = String(e.rank).padStart(2, '0');
    ctx.font = top ? `700 44px ${SANS}` : `500 24px ${SANS}`;
    ctx.fillText(label, M, cy + (top ? 2 : 1));

    // Avatar
    const ax = M + 128;
    const ar = top ? 34 : 26;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, cy, ar, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (e.avatar) {
      ctx.drawImage(e.avatar, ax - ar, cy - ar, ar * 2, ar * 2);
    } else {
      ctx.fillStyle = '#26282c';
      ctx.fillRect(ax - ar, cy - ar, ar * 2, ar * 2);
      ctx.fillStyle = MUTED;
      ctx.font = `600 ${top ? 28 : 22}px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.fillText([...e.name][0]?.toUpperCase() || '?', ax, cy + 1);
    }
    ctx.restore();
    if (top) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ax, cy, ar + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Amount: small "RM" + larger figure, right-aligned
    const right = W - M;
    ctx.textAlign = 'right';
    ctx.font = `700 ${top ? 32 : 26}px ${SANS}`;
    ctx.fillStyle = top ? color : INK;
    const figure = moneyNumber(e.cents);
    ctx.fillText(figure, right, cy + 1);
    const figW = ctx.measureText(figure).width;
    ctx.font = `600 ${top ? 17 : 15}px ${SANS}`;
    ctx.fillStyle = MUTED;
    ctx.fillText('RM', right - figW - 8, cy + 2);
    const rmW = ctx.measureText('RM').width;

    // Name
    const nameX = ax + 54;
    ctx.textAlign = 'left';
    ctx.font = `${top ? 700 : 600} ${top ? 28 : 23}px ${SANS}`;
    ctx.fillStyle = INK;
    ctx.fillText(fit(ctx, e.name, right - figW - rmW - 8 - 24 - nameX), nameX, cy + 1);

    // Divider
    y += h;
    if (i < entries.length - 1) {
      ctx.fillStyle = LINE;
      ctx.fillRect(M, y - 1, W - M * 2, 1);
    }
  });

  // ---- Footer ----
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = LINE;
  ctx.fillRect(M, H - FOOTER_H + 14, W - M * 2, 1);

  const stamp = new Date().toLocaleString('en-MY', {
    timeZone: process.env.TIMEZONE || 'Asia/Kuala_Lumpur',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  ctx.fillStyle = MUTED;
  ctx.font = `400 15px ${SANS}`;
  ctx.textAlign = 'left';
  ctx.fillText(`Updated ${stamp}`, M, H - 28);

  return canvas.toBuffer('image/png');
}

module.exports = { renderLeaderboard };
