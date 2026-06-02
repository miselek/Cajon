// "Dálnice" padajících úderů ve stylu Guitar Hero / Piano Tiles.
// Vykresluje 4 pruhy: L-tón | L-bass | R-bass | R-tón (bass uprostřed,
// tóny po krajích – jako rozložení na opravdovém cajonu). Noty padají
// shora dolů k „čáře teď"; co je blíž čáře, to přijde dřív.

const LANE_LABELS = ['L · tón', 'L · bass', 'R · bass', 'R · tón'];
const COLORS = {
  bass: '#ff6b6b',
  tone: '#54d6c0',
  ghost: '#8a80b5',
};

// Pruh podle ruky a typu úderu (bass/ghost doprostřed, tón po kraji).
export function laneIndex(hand, hit) {
  if (hit === 'tone') return hand === 'L' ? 0 : 3;
  return hand === 'L' ? 1 : 2;
}

// Nastaví rozlišení canvasu podle velikosti na stránce (kvůli ostrosti).
export function fitHighway(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h };
}

// Vykreslí jeden snímek. hits = [{hit, hand, timeUntil}], windowSec = lookahead.
export function drawHighway(canvas, hits, windowSec) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  const lanes = 4;
  const laneW = w / lanes;
  const hitLineY = h - 46;

  ctx.clearRect(0, 0, w, h);

  // pruhy + oddělovače
  for (let i = 0; i < lanes; i++) {
    const x = i * laneW;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)';
    ctx.fillRect(x, 0, laneW, h);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  for (let i = 1; i < lanes; i++) {
    ctx.beginPath();
    ctx.moveTo(i * laneW, 0);
    ctx.lineTo(i * laneW, h);
    ctx.stroke();
  }
  // zvýraznění středu (bass / tón předěl)
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.moveTo(2 * laneW, 0);
  ctx.lineTo(2 * laneW, h);
  ctx.stroke();

  // čára "teď"
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, hitLineY);
  ctx.lineTo(w, hitLineY);
  ctx.stroke();
  ctx.shadowColor = '#ffd166';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(0, hitLineY);
  ctx.lineTo(w, hitLineY);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // padající noty
  for (const n of hits) {
    const lane = laneIndex(n.hand, n.hit);
    const cx = lane * laneW + laneW / 2;
    const progress = 1 - n.timeUntil / windowSec; // 1 = u čáry
    const cy = progress * hitLineY;
    const dist = Math.abs(n.timeUntil);
    const atLine = dist < 0.07;

    const r = n.hit === 'ghost' ? laneW * 0.14 : laneW * 0.32;
    const color = COLORS[n.hit] || '#fff';

    // záblesk při dopadu na čáru
    if (atLine) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 22;
    }

    if (n.hit === 'tone') {
      // tón = prstenec
      ctx.lineWidth = Math.max(3, r * 0.35);
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      ctx.globalAlpha = n.hit === 'ghost' ? 0.6 : 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.shadowBlur = 0;

    // písmeno ruky uvnitř hlavních not
    if (n.hit !== 'ghost' && r > 12) {
      ctx.fillStyle = n.hit === 'tone' ? color : '#2a1c00';
      ctx.font = `bold ${Math.round(r)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.hand, cx, cy + 1);
    }
  }

  // popisky pruhů pod čárou
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < lanes; i++) {
    ctx.fillText(LANE_LABELS[i], i * laneW + laneW / 2, h - 22);
  }
}
