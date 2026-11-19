/* ============================================================
   chart.js — lightweight canvas charts (no libraries)
   Chart.draw(canvas, { series:[{x,y,color,width,dash,type:'line'|'points',r,label}],
                        xlabel, ylabel, title, light, width, height, xmin, xmax })
   ============================================================ */
'use strict';

const Chart = (() => {
  const DARK = { bg: '#0f172a', grid: '#1e293b', axis: '#475569', text: '#cbd5e1' };
  const LIGHT = { bg: '#ffffff', grid: '#e5e7eb', axis: '#9ca3af', text: '#111827' };

  function ticks(min, max, count = 6) {
    const span = max - min || 1, raw = span / count;
    const mag = 10 ** Math.floor(Math.log10(raw)), nrm = raw / mag;
    const step = (nrm < 1.5 ? 1 : nrm < 3 ? 2 : nrm < 7 ? 5 : 10) * mag;
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(+v.toPrecision(12));
    return { v: out, step };
  }
  function lab(v, step) {
    if (v === 0) return '0';
    if (Math.abs(v) >= 1e5 || Math.abs(v) < 1e-3) return v.toExponential(1);
    const d = Math.max(0, Math.min(6, -Math.floor(Math.log10(step))));
    return v.toFixed(d);
  }

  function draw(canvas, o) {
    const th = o.light ? LIGHT : DARK;
    const W = o.width || canvas.clientWidth || 600, H = o.height || canvas.clientHeight || 260;
    const dpr = o.width ? 1 : (window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
    const fsz = o.fontSize || 12;
    ctx.font = `${fsz}px system-ui, -apple-system, Segoe UI, sans-serif`;
    ctx.direction = 'ltr';
    const pad = { l: 64, r: 14, t: o.title ? 30 : 14, b: 44 };

    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (const s of o.series) {
      for (let i = 0; i < s.x.length; i++) {
        const x = s.x[i], y = s.y[i];
        if (!isFinite(x) || !isFinite(y)) continue;
        if (o.xmin != null && x < o.xmin) continue;
        if (o.xmax != null && x > o.xmax) continue;
        if (x < xmin) xmin = x; if (x > xmax) xmax = x;
        if (y < ymin) ymin = y; if (y > ymax) ymax = y;
      }
    }
    if (o.xmin != null) xmin = o.xmin; if (o.xmax != null) xmax = o.xmax;
    if (!isFinite(xmin) || !isFinite(ymin)) {
      ctx.fillStyle = th.text; ctx.textAlign = 'center';
      ctx.fillText(o.empty || 'No data yet', W / 2, H / 2); return;
    }
    if (xmax === xmin) { xmax += 1; xmin -= 1; }
    if (ymax === ymin) { ymax += 1; ymin -= 1; }
    const yp = (ymax - ymin) * 0.08; ymin -= yp; ymax += yp;
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    const X = x => pad.l + (x - xmin) / (xmax - xmin) * pw;
    const Y = y => pad.t + (1 - (y - ymin) / (ymax - ymin)) * ph;

    // grid
    ctx.lineWidth = 1; ctx.strokeStyle = th.grid; ctx.fillStyle = th.text;
    const tx = ticks(xmin, xmax, Math.max(3, Math.floor(pw / 90))), ty = ticks(ymin, ymax, Math.max(3, Math.floor(ph / 50)));
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const v of tx.v) { const p = X(v); ctx.beginPath(); ctx.moveTo(p, pad.t); ctx.lineTo(p, pad.t + ph); ctx.stroke(); ctx.fillText(lab(v, tx.step), p, pad.t + ph + 6); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const v of ty.v) { const p = Y(v); ctx.beginPath(); ctx.moveTo(pad.l, p); ctx.lineTo(pad.l + pw, p); ctx.stroke(); ctx.fillText(lab(v, ty.step), pad.l - 6, p); }
    ctx.strokeStyle = th.axis; ctx.strokeRect(pad.l, pad.t, pw, ph);

    // series
    ctx.save(); ctx.beginPath(); ctx.rect(pad.l, pad.t, pw, ph); ctx.clip();
    for (const s of o.series) {
      ctx.strokeStyle = ctx.fillStyle = s.color || '#38bdf8';
      ctx.lineWidth = s.width || 1.5; ctx.setLineDash(s.dash || []);
      if (s.type === 'points') {
        const r = s.r || 3;
        for (let i = 0; i < s.x.length; i++) { if (!isFinite(s.y[i])) continue; ctx.beginPath(); ctx.arc(X(s.x[i]), Y(s.y[i]), r, 0, 2 * Math.PI); ctx.fill(); }
        continue;
      }
      ctx.beginPath();
      const n = s.x.length;
      if (n <= pw * 2) {
        let started = false;
        for (let i = 0; i < n; i++) {
          if (!isFinite(s.y[i])) { started = false; continue; }
          const px = X(s.x[i]), py = Y(s.y[i]);
          if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
        }
      } else {   // decimation: min/max per pixel column
        let col = null, mn = 0, mx = 0, first = true;
        const flush = () => { if (col === null) return; if (first) { ctx.moveTo(col, Y(mn)); first = false; } else ctx.lineTo(col, Y(mn)); ctx.lineTo(col, Y(mx)); };
        for (let i = 0; i < n; i++) {
          const x = s.x[i], y = s.y[i];
          if (x < xmin || x > xmax || !isFinite(y)) continue;
          const c = Math.floor(X(x));
          if (c !== col) { flush(); col = c; mn = mx = y; } else { if (y < mn) mn = y; if (y > mx) mx = y; }
        }
        flush();
      }
      ctx.stroke();
    }
    ctx.restore(); ctx.setLineDash([]);

    // labels
    ctx.fillStyle = th.text; ctx.textBaseline = 'alphabetic';
    if (o.xlabel) { ctx.textAlign = 'center'; ctx.fillText(o.xlabel, pad.l + pw / 2, H - 6); }
    if (o.ylabel) { ctx.save(); ctx.translate(14, pad.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText(o.ylabel, 0, 0); ctx.restore(); }
    if (o.title) { ctx.textAlign = 'left'; ctx.font = `bold ${fsz + 1}px system-ui, sans-serif`; ctx.fillText(o.title, pad.l, 19); ctx.font = `${fsz}px system-ui, sans-serif`; }

    // legend
    const leg = o.series.filter(s => s.label);
    if (leg.length) {
      let x = pad.l + pw - 8; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (let i = leg.length - 1; i >= 0; i--) {
        const s = leg[i], w = ctx.measureText(s.label).width;
        ctx.fillStyle = th.text; ctx.fillText(s.label, x, pad.t + 12);
        ctx.fillStyle = s.color || '#38bdf8'; ctx.fillRect(x - w - 18, pad.t + 9, 12, 6);
        x -= w + 32;
      }
    }
  }

  return { draw };
})();
