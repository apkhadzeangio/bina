// Plan symbols of the furniture library, in the manner of architectural drawings. Each
// symbol is drawn in the piece's local frame in metres: origin at its centre, width along
// x, depth along y, the front towards +y. The caller sets the canvas transform.
export function drawFurnitureSymbol(ctx, type, w, d, { ink, fill, lw }) {
  const hw = w / 2;
  const hd = d / 2;
  ctx.save();
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = ink;
  ctx.fillStyle = fill;
  const path = (fn) => {
    ctx.beginPath();
    fn();
  };
  const rect = (x0, y0, x1, y1, doFill = true) => {
    path(() => ctx.rect(x0, y0, x1 - x0, y1 - y0));
    if (doFill) ctx.fill();
    ctx.stroke();
  };
  const rrect = (x0, y0, x1, y1, r, doFill = true) => {
    const rr = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2));
    path(() => {
      ctx.moveTo(x0 + rr, y0);
      ctx.arcTo(x1, y0, x1, y1, rr);
      ctx.arcTo(x1, y1, x0, y1, rr);
      ctx.arcTo(x0, y1, x0, y0, rr);
      ctx.arcTo(x0, y0, x1, y0, rr);
      ctx.closePath();
    });
    if (doFill) ctx.fill();
    ctx.stroke();
  };
  const line = (x0, y0, x1, y1) => {
    path(() => {
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
    });
    ctx.stroke();
  };
  const circle = (cx, cy, r, doFill = false) => {
    path(() => ctx.arc(cx, cy, Math.max(0.001, r), 0, Math.PI * 2));
    if (doFill) ctx.fill();
    ctx.stroke();
  };
  const ellipse = (cx, cy, rx, ry, doFill = false) => {
    path(() => ctx.ellipse(cx, cy, Math.max(0.001, rx), Math.max(0.001, ry), 0, 0, Math.PI * 2));
    if (doFill) ctx.fill();
    ctx.stroke();
  };
  const faint = (fn) => {
    ctx.save();
    ctx.globalAlpha *= 0.55;
    fn();
    ctx.restore();
  };

  switch (type) {
    case 'sofa':
    case 'armchair': {
      const back = Math.min(0.22, d * 0.26);
      const arm = Math.min(0.18, w * 0.12);
      rrect(-hw, -hd, hw, hd, 0.05);
      rect(-hw, -hd, hw, -hd + back, false);
      rect(-hw, -hd + back, -hw + arm, hd, false);
      rect(hw - arm, -hd + back, hw, hd, false);
      const n = type === 'armchair' ? 1 : w > 2.5 ? 3 : w > 1.3 ? 2 : 1;
      const x0 = -hw + arm;
      const span = (w - arm * 2) / n;
      for (let k = 1; k < n; k++) line(x0 + span * k, -hd + back, x0 + span * k, hd - 0.03);
      break;
    }
    case 'coffee_table':
      rrect(-hw, -hd, hw, hd, 0.04);
      faint(() => rrect(-hw + 0.06, -hd + 0.06, hw - 0.06, hd - 0.06, 0.02, false));
      break;
    case 'tv_unit': {
      rect(-hw, -hd, hw, hd);
      const tw = Math.min(hw * 0.85, 0.75);
      ctx.save();
      ctx.lineWidth = lw * 2.4;
      line(-tw, -hd + 0.09, tw, -hd + 0.09);
      ctx.restore();
      faint(() => { for (const x of [-hw / 3, hw / 3]) line(x, -hd + 0.15, x, hd); });
      break;
    }
    case 'bed_single':
    case 'bed_double': {
      rect(-hw, -hd, hw, hd);
      rect(-hw, -hd, hw, -hd + 0.07, false);
      const py0 = -hd + 0.13;
      const py1 = Math.min(-hd + 0.45, -hd + d * 0.24);
      if (w >= 1.2) {
        rrect(-hw + 0.08, py0, -0.04, py1, 0.06, false);
        rrect(0.04, py0, hw - 0.08, py1, 0.06, false);
      } else {
        rrect(-hw + 0.08, py0, hw - 0.08, py1, 0.06, false);
      }
      const fold = Math.min(-hd + 0.62, -hd + d * 0.32);
      line(-hw, fold, hw, fold);
      faint(() => line(hw - Math.min(0.4, w * 0.35), fold, hw, fold + Math.min(0.4, w * 0.35)));
      break;
    }
    case 'wardrobe': {
      rect(-hw, -hd, hw, hd);
      line(-hw, hd - 0.04, hw, hd - 0.04);
      ctx.save();
      ctx.setLineDash([0.06, 0.04]);
      line(-hw + 0.05, 0, hw - 0.05, 0);
      ctx.restore();
      faint(() => {
        for (let x = -hw + 0.12; x < hw - 0.08; x += 0.14) line(x - 0.03, -0.14, x + 0.03, 0.14);
      });
      break;
    }
    case 'bedside':
      rect(-hw, -hd, hw, hd);
      circle(0, 0, Math.min(w, d) * 0.24);
      faint(() => {
        const r = Math.min(w, d) * 0.34;
        line(-r, 0, r, 0);
        line(0, -r, 0, r);
      });
      break;
    case 'dining_table':
      rrect(-hw, -hd, hw, hd, 0.03);
      break;
    case 'chair':
      rrect(-hw + 0.02, -hd + 0.07, hw - 0.02, hd - 0.01, 0.05);
      rect(-hw, -hd, hw, -hd + 0.07);
      break;
    case 'desk':
      rect(-hw, -hd, hw, hd);
      ctx.save();
      ctx.lineWidth = lw * 2;
      line(-Math.min(0.28, hw * 0.5), -hd + 0.08, Math.min(0.28, hw * 0.5), -hd + 0.08);
      ctx.restore();
      break;
    case 'kitchen_run': {
      rect(-hw, -hd, hw, hd);
      line(-hw, hd - 0.04, hw, hd - 0.04);
      faint(() => {
        const n = Math.max(1, Math.round(w / 0.6));
        for (let k = 1; k < n; k++) {
          const x = -hw + (w / n) * k;
          line(x, -hd, x, hd - 0.04);
        }
      });
      break;
    }
    case 'fridge':
      rect(-hw, -hd, hw, hd);
      line(-hw, hd - 0.06, hw, hd - 0.06);
      faint(() => line(-hw, -hd, hw, hd - 0.06));
      break;
    case 'stove': {
      rect(-hw, -hd, hw, hd);
      const r = Math.min(w, d) * 0.12;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) circle(sx * w * 0.22, sy * d * 0.2 - 0.02, r);
      faint(() => line(-hw + 0.05, hd - 0.05, hw - 0.05, hd - 0.05));
      break;
    }
    case 'sink':
      rect(-hw, -hd, hw, hd);
      rrect(-hw + 0.1, -hd + 0.09, hw - 0.1, hd - 0.12, 0.05, false);
      circle(0, (hd - 0.12 - hd + 0.09) / 2, 0.025);
      circle(0, -hd + 0.045, 0.02, true);
      break;
    case 'toilet': {
      const tank = Math.min(0.2, d * 0.3);
      rrect(-hw, -hd, hw, -hd + tank, 0.03);
      const cy = -hd + tank + (d - tank) / 2;
      ellipse(0, cy, hw * 0.92, (d - tank) / 2, true);
      faint(() => ellipse(0, cy + 0.02, hw * 0.55, (d - tank) / 2 - 0.08));
      break;
    }
    case 'bathtub':
      rect(-hw, -hd, hw, hd);
      rrect(-hw + 0.07, -hd + 0.07, hw - 0.07, hd - 0.07, Math.min(0.14, hd - 0.07), false);
      circle(-hw + 0.2, 0, 0.03);
      break;
    case 'shower':
      rect(-hw, -hd, hw, hd);
      faint(() => {
        line(-hw, -hd, hw, hd);
        line(hw, -hd, -hw, hd);
      });
      circle(0, 0, 0.04, true);
      break;
    case 'vanity':
      rect(-hw, -hd, hw, hd);
      ellipse(0, 0.03, Math.max(0.05, Math.min(hw - 0.08, 0.26)), Math.max(0.05, Math.min(hd - 0.1, 0.17)));
      circle(0, -hd + 0.06, 0.02, true);
      break;
    default:
      rect(-hw, -hd, hw, hd);
  }
  ctx.restore();
}

// A thumbnail of a piece for the library: the symbol fitted into a small canvas.
export function furnitureThumb(type, w, d, colors, size = 88) {
  const c = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = size * dpr;
  c.height = Math.round(size * 0.72) * dpr;
  c.style.width = `${size}px`;
  c.style.height = `${Math.round(size * 0.72)}px`;
  const ctx = c.getContext('2d');
  const pad = 8 * dpr;
  const k = Math.min((c.width - pad * 2) / w, (c.height - pad * 2) / d);
  ctx.translate(c.width / 2, c.height / 2);
  ctx.scale(k, k);
  drawFurnitureSymbol(ctx, type, w, d, { ink: colors.ink, fill: colors.fill, lw: (1.4 * dpr) / k });
  c.setAttribute('aria-hidden', 'true');
  return c;
}
