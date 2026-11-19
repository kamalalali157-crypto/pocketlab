/* ============================================================
   analysis.js — signal processing and damped-vibration fitting
   Model:  x(t) = A·e^(−στ)·cos(ω_d τ + φ) + x0
   ============================================================ */
'use strict';

const Analysis = (() => {

  /* ---------- basic helpers ---------- */
  function linreg(x, y) {
    const n = x.length; let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; sxx += x[i] * x[i]; sxy += x[i] * y[i]; syy += y[i] * y[i]; }
    const d = n * sxx - sx * sx;
    const b = (n * sxy - sx * sy) / d, a = (sy - b * sx) / n;
    let sse = 0; for (let i = 0; i < n; i++) { const r = y[i] - (a + b * x[i]); sse += r * r; }
    const sst = syy - sy * sy / n;
    const sb = n > 2 ? Math.sqrt(sse / (n - 2) / (sxx - sx * sx / n)) : NaN;
    return { a, b, sb, r2: sst > 0 ? 1 - sse / sst : 1 };
  }
  const median = a => { const s = Array.from(a).sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
  function std(a) { let m = 0; for (const v of a) m += v; m /= a.length; let s = 0; for (const v of a) s += (v - m) ** 2; return Math.sqrt(s / a.length); }

  function resample(t, y, fs) {
    const t0 = t[0], n = Math.max(2, Math.floor((t[t.length - 1] - t0) * fs) + 1);
    const tt = new Float64Array(n), yy = new Float64Array(n);
    let j = 0;
    for (let i = 0; i < n; i++) {
      const ti = t0 + i / fs;
      while (j < t.length - 2 && t[j + 1] < ti) j++;
      const dt = t[j + 1] - t[j];
      const a = Math.min(1, Math.max(0, dt > 0 ? (ti - t[j]) / dt : 0));
      yy[i] = y[j] + a * (y[j + 1] - y[j]); tt[i] = i / fs;
    }
    return { t: tt, y: yy };
  }

  function movingAverage(y, w) {
    w = Math.max(1, Math.round(w));
    if (w <= 1) return Float64Array.from(y);
    const n = y.length, ps = new Float64Array(n + 1), out = new Float64Array(n), h = Math.floor(w / 2);
    for (let i = 0; i < n; i++) ps[i + 1] = ps[i] + y[i];
    for (let i = 0; i < n; i++) { const a = Math.max(0, i - h), b = Math.min(n, i + h + 1); out[i] = (ps[b] - ps[a]) / (b - a); }
    return out;
  }

  /* Zero-phase band-pass filter (RBJ biquad, forward–backward) */
  function bandpass(y, fs, f0, Q) {
    const w0 = 2 * Math.PI * f0 / fs, al = Math.sin(w0) / (2 * Q), a0 = 1 + al;
    const b0 = al / a0, b2 = -al / a0, a1 = -2 * Math.cos(w0) / a0, a2 = (1 - al) / a0;
    const run = x => {
      const o = new Float64Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; o[i] = v; }
      return o;
    };
    return run(run(Float64Array.from(y)).reverse()).reverse();
  }

  /* FFT (radix-2, in place) */
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < half; k++) {
          const p = i + k, q = p + half;
          const br = re[q] * cr - im[q] * ci, bi = re[q] * ci + im[q] * cr;
          re[q] = re[p] - br; im[q] = im[p] - bi; re[p] += br; im[p] += bi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }

  function spectrum(y, fs, minN = 4096) {
    const m = Math.min(y.length, 1 << 18);
    let n = 1; while (n < Math.max(m * 2, minN)) n <<= 1;
    const re = new Float64Array(n), im = new Float64Array(n);
    let mean = 0; for (let i = 0; i < m; i++) mean += y[i]; mean /= m;
    for (let i = 0; i < m; i++) re[i] = (y[i] - mean) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (m - 1)));
    fft(re, im);
    const half = n / 2, mag = new Float64Array(half), f = new Float64Array(half);
    for (let i = 0; i < half; i++) { mag[i] = Math.hypot(re[i], im[i]) * 2 / m; f[i] = i * fs / n; }
    return { f, mag, df: fs / n };
  }

  function dominantFreq(spec, fmin, fmax) {
    let best = -1, bi = -1;
    for (let i = 1; i < spec.f.length - 1; i++) {
      if (spec.f[i] < fmin || spec.f[i] > fmax) continue;
      if (spec.mag[i] > best) { best = spec.mag[i]; bi = i; }
    }
    if (bi < 1) return null;
    const a = spec.mag[bi - 1], b = spec.mag[bi], c = spec.mag[bi + 1];
    const den = a - 2 * b + c, p = den ? 0.5 * (a - c) / den : 0;
    return (bi + p) * spec.df;
  }

  /* Nelder–Mead function minimiser */
  function nelderMead(f, x0, step, maxIter = 3000, tol = 1e-12) {
    const n = x0.length;
    let P = [x0.slice()];
    for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] += step[i]; P.push(p); }
    let V = P.map(f);
    for (let it = 0; it < maxIter; it++) {
      const idx = P.map((_, i) => i).sort((a, b) => V[a] - V[b]);
      P = idx.map(i => P[i]); V = idx.map(i => V[i]);
      if (Math.abs(V[n] - V[0]) <= tol * (Math.abs(V[0]) + 1e-30)) break;
      const c = new Array(n).fill(0);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += P[i][j] / n;
      const xr = c.map((v, j) => 2 * v - P[n][j]), fr = f(xr);
      if (fr < V[0]) {
        const xe = c.map((v, j) => 3 * v - 2 * P[n][j]), fe = f(xe);
        if (fe < fr) { P[n] = xe; V[n] = fe; } else { P[n] = xr; V[n] = fr; }
      } else if (fr < V[n - 1]) { P[n] = xr; V[n] = fr; }
      else {
        const xc = fr < V[n] ? c.map((v, j) => v + 0.5 * (xr[j] - v)) : c.map((v, j) => v + 0.5 * (P[n][j] - v));
        const fc = f(xc);
        if (fc < Math.min(fr, V[n])) { P[n] = xc; V[n] = fc; }
        else for (let i = 1; i <= n; i++) { P[i] = P[i].map((v, j) => P[0][j] + 0.5 * (v - P[0][j])); V[i] = f(P[i]); }
      }
    }
    let bi = 0; for (let i = 1; i <= n; i++) if (V[i] < V[bi]) bi = i;
    return { x: P[bi], fx: V[bi] };
  }

  function modelAt(m, t) {
    const tau = t - m.ts;
    return m.A * Math.exp(-m.sigma * tau) * Math.cos(m.w * tau + m.phi) + m.c;
  }

  /* ============================================================
     Main analysis
     rec = { mode, t?, y, fs?, uniform? }
     ============================================================ */
  function analyze(rec, opt = {}) {
    const mode = rec.mode;
    const isMic = mode === 'mic';
    let fs, T, Y;

    /* 1) uniform time base */
    if (rec.uniform) {
      fs = rec.fs; Y = Float64Array.from(rec.y);
      T = new Float64Array(Y.length); for (let i = 0; i < Y.length; i++) T[i] = i / fs;
    } else {
      const t = [], y = [];
      for (let i = 0; i < rec.t.length; i++) {
        if (!isFinite(rec.y[i]) || !isFinite(rec.t[i])) continue;
        if (t.length && rec.t[i] <= t[t.length - 1]) continue;
        t.push(rec.t[i]); y.push(rec.y[i]);
      }
      if (t.length < 20) return { ok: false, error: 'Too little data. Record for longer.' };
      const dts = []; for (let i = 1; i < t.length; i++) dts.push(t[i] - t[i - 1]);
      fs = Math.min(1 / median(dts), 500);
      const r = resample(t, y, fs); T = r.t; Y = r.y;
    }
    const n = Y.length;
    if (n < 30) return { ok: false, error: 'The recording is too short.' };
    let mean = 0; for (let i = 0; i < n; i++) mean += Y[i]; mean /= n;
    for (let i = 0; i < n; i++) Y[i] -= mean;

    /* 2) frequency candidates: from the spectrum of the signal and of its derivative (the derivative ignores the constant offset while the object is held) */
    const fmin = opt.fmin ?? (isMic ? 20 : 0.2);
    const fmax = Math.min(0.45 * fs, opt.fmax ?? Infinity);
    const dY = new Float64Array(n - 1); for (let i = 0; i < n - 1; i++) dY[i] = Y[i + 1] - Y[i];
    const cands = [dominantFreq(spectrum(Y, fs), fmin, fmax), dominantFreq(spectrum(dY, fs), fmin, fmax)]
      .filter(f => f && isFinite(f));
    if (!cands.length) return { ok: false, error: 'No clear frequency was found in the signal.' };

    /* 3+4) for each candidate: filter, then zero crossings with hysteresis → free-vibration region */
    function detect(f0) {
      const P = fs / f0;
      const Yf = isMic ? bandpass(Y, fs, f0, 2) : movingAverage(Y, fs / (f0 * 12));
      let hp = Yf;
      if (!isMic) { const ma = movingAverage(Yf, 2 * P); hp = new Float64Array(n); for (let i = 0; i < n; i++) hp[i] = Yf[i] - ma[i]; }
      // noise level: RMS of the quietest 10 % of windows
      const W = Math.max(4, Math.round(2 * P)), rms = [];
      for (let a = 0; a + W <= n; a += W) { let q = 0; for (let i = a; i < a + W; i++) q += hp[i] * hp[i]; rms.push(Math.sqrt(q / W)); }
      rms.sort((a, b) => a - b);
      let quiet = rms.length ? rms[Math.floor(rms.length * 0.1)] : 0;
      // second noise estimate from the second difference (useful when the whole record oscillates)
      const w = Math.max(1, Math.round(isMic ? 1 : fs / (f0 * 12)));
      const d2 = new Float64Array(n - 2); for (let i = 1; i < n - 1; i++) d2[i - 1] = Y[i + 1] - 2 * Y[i] + Y[i - 1];
      quiet = Math.min(quiet, std(d2) / Math.sqrt(6) / Math.sqrt(w));
      let hmax = 0; for (let i = 0; i < n; i++) hmax = Math.max(hmax, Math.abs(hp[i]));
      const h = Math.max(0.04 * hmax, 2.5 * quiet);
      const cross = []; let s = 0;
      for (let i = 0; i < n; i++) {
        if (hp[i] > h && s <= 0) { if (s !== 0) cross.push(i); s = 1; }
        else if (hp[i] < -h && s >= 0) { if (s !== 0) cross.push(i); s = -1; }
      }
      let best = { a: 0, b: -1 }, ra = 0;
      for (let j = 1; j <= cross.length; j++) {
        const d = j < cross.length ? cross[j] - cross[j - 1] : -1;
        if (!(d > 0.25 * P && d < 0.85 * P)) { if (j - 1 - ra > best.b - best.a) best = { a: ra, b: j - 1 }; ra = j; }
      }
      return { f0, P, Yf, hp, h, cross, best, len: best.b - best.a };
    }
    function runWith(f0) {
    const det = detect(f0);
    const { P, Yf, hp, h, cross, best } = det;
    if (best.b - best.a < 3) return { ok: false, error: 'No clear free vibration found (at least two cycles are needed). Displace the object more and let it vibrate freely.' };
    // free vibration starts at the largest amplitude (the moment of release)
    let kMax = cross[best.a];
    for (let i = cross[best.a]; i <= cross[best.b]; i++) if (Math.abs(hp[i]) > Math.abs(hp[kMax])) kMax = i;
    let jS = best.a; while (jS < best.b - 3 && cross[jS + 1] <= kMax) jS++;
    const regA = Math.max(0, Math.floor(cross[jS] - 0.5 * P)), regB = Math.min(n - 1, Math.ceil(cross[best.b] + P / 2));

    /* 5) peaks and troughs → amplitude (peak-to-trough/2, insensitive to offsets) */
    const argmax = (a, b) => { let k = a; for (let i = a; i < b; i++) if (Yf[i] > Yf[k]) k = i; return k; };
    const argmin = (a, b) => { let k = a; for (let i = a; i < b; i++) if (Yf[i] < Yf[k]) k = i; return k; };
    const refine = i => {
      if (i <= 0 || i >= n - 1) return { t: i / fs, v: Yf[i] };
      const a = Yf[i - 1], b = Yf[i], c = Yf[i + 1], den = a - 2 * b + c;
      const p = den ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / den)) : 0;
      return { t: (i + p) / fs, v: b - 0.25 * (a - c) * p };
    };
    const pk = [argmax(regA, Math.min(regB, Math.floor(cross[jS] + 0.6 * P)))];
    while (pk.length < 4000) {
      const a = Math.floor(pk[pk.length - 1] + 0.5 * P), b = Math.min(regB, Math.floor(pk[pk.length - 1] + 1.5 * P));
      if (b - a < 2) break;
      pk.push(argmax(a, b));
    }
    const peaks = [];
    for (let j = 0; j < pk.length - 1; j++) {
      const tr = argmin(pk[j], pk[j + 1]);
      const p = refine(pk[j]), amp = (Yf[pk[j]] - Yf[tr]) / 2;
      if (amp <= h) break;
      if (peaks.length >= 3 && amp > 1.3 * peaks[peaks.length - 1].a) break;  // re-excitation
      peaks.push({ t: p.t, a: amp, i: pk[j] });
    }
    // drop leading peaks whose spacing is abnormal (moment of release)
    if (peaks.length >= 4) {
      const gaps = []; for (let j = 1; j < peaks.length; j++) gaps.push(peaks[j].t - peaks[j - 1].t);
      const mg = median(gaps);
      while (peaks.length >= 4 && Math.abs(peaks[1].t - peaks[0].t - mg) > 0.2 * mg) peaks.shift();
    }
    if (peaks.length < 2) return { ok: false, error: 'Too few peaks. The damping is too high or the signal too weak.' };

    /* 6) decay rate σ from ln(A) vs t, and period from peak times */
    const tp = peaks.map(p => p.t), lnA = peaks.map(p => Math.log(p.a));
    const lr = linreg(tp, lnA);
    let sigma = Math.max(-lr.b, 1e-6), sigmaSE = lr.sb;
    const pr = linreg(peaks.map((_, i) => i), tp);
    let Td = pr.b, TdSE = pr.sb;
    if (!(Td > 0)) Td = P / fs;
    let fd = 1 / Td;
    // non-viscous damping? compare σ in the first and second halves
    let sigmaEarly = null, sigmaLate = null;
    if (peaks.length >= 8) {
      const hN = Math.floor(peaks.length / 2);
      sigmaEarly = -linreg(tp.slice(0, hN), lnA.slice(0, hN)).b;
      sigmaLate = -linreg(tp.slice(hN), lnA.slice(hN)).b;
    }

    /* 7) full waveform fit (Nelder–Mead) */
    const i0 = peaks[0].i, i1 = Math.min(n - 1, Math.round(peaks[peaks.length - 1].i + P / 2));
    let model = { A: peaks[0].a, sigma, w: 2 * Math.PI * fd, phi: 0, c: 0, ts: peaks[0].t };
    let r2 = lr.r2, r2Type = 'envelope', method = 'peaks';
    if (!isMic && i1 - i0 < 20000) {
      const idx = []; for (let i = i0; i <= i1; i++) idx.push(i);
      let ym = 0; for (const i of idx) ym += Y[i]; ym /= idx.length;
      let sst = 0; for (const i of idx) sst += (Y[i] - ym) ** 2;
      const sse = m => { let e = 0; for (const i of idx) { const r = Y[i] - modelAt(m, T[i]); e += r * r; } return e; };
      const toM = x => ({ A: x[0], sigma: x[1], w: x[2], phi: x[3], c: x[4], ts: model.ts });
      model.c = ym;
      const sse0 = sse(model);
      const res = nelderMead(x => { const m = toM(x); return m.sigma < 0 ? 1e30 : sse(m); },
        [model.A, model.sigma, model.w, 0, ym],
        [model.A * 0.1, model.sigma * 0.3 + 0.01, model.w * 0.01, 0.2, model.A * 0.05 + 1e-9]);
      const m2 = toM(res.x);
      if (res.fx < sse0 && Math.abs(m2.w / model.w - 1) < 0.2 && m2.A > 0) {
        model = m2; sigma = m2.sigma; fd = m2.w / (2 * Math.PI); Td = 1 / fd; method = 'nelder-mead';
      }
      r2 = sst > 0 ? 1 - Math.min(res.fx, sse0) / sst : 1; r2Type = 'waveform';
    }

    if (fs / fd < 4) return { ok: false, error: 'The frequency is too high for this sensor sampling rate. Try the microphone.' };
    if (peaks.length < 3 && r2 < 0.9) return { ok: false, error: 'The signal is not clear enough. Try a larger amplitude or a quieter place.' };

    /* 8) physical parameters */
    const wd = 2 * Math.PI * fd, wn = Math.sqrt(wd * wd + sigma * sigma), fn = wn / (2 * Math.PI);
    const zeta = sigma / wn, delta = sigma * Td, Q = 1 / (2 * zeta), tau = 1 / sigma;
    const fdSE = isFinite(TdSE) ? TdSE / (Td * Td) : NaN;
    const zetaSE = zeta * Math.sqrt(((sigmaSE || 0) / sigma) ** 2 + ((fdSE || 0) / fd) ** 2);

    /* 9) spectrum for display (vibration region only) */
    const sp = spectrum(Y.subarray(regA, regB + 1), fs);
    const fShow = Math.min(fs / 2, Math.max(4 * fd, 5));
    const specF = [], specM = [];
    const stepS = Math.max(1, Math.ceil(sp.f.filter(v => v <= fShow).length / 1500));
    for (let i = 0; i < sp.f.length && sp.f[i] <= fShow; i += stepS) { specF.push(sp.f[i]); specM.push(sp.mag[i]); }
    const fSpec = dominantFreq(sp, fmin, fmax);

    return {
      ok: true, mode, fs, n, duration: n / fs, t: T, y: Y, yf: Yf, region: [regA, regB], fit: [i0, i1],
      peaks, model, method, r2, r2Type, lnFit: { a: lr.a, b: lr.b },
      fd, Td, wd, wn, fn, sigma, sigmaSE, fdSE, zeta, zetaSE, delta, Q, tau,
      fnSE: fdSE, sigmaEarly, sigmaLate, fSpec,
      nCycles: peaks.length, spec: { f: specF, mag: specM },
      samplesPerCycle: fs / fd, rawSamples: rec.t ? rec.t.length : rec.y.length
    };
    }

    /* try every candidate and keep the best */
    const results = cands.map(runWith), good = results.filter(r => r.ok);
    if (!good.length) return results[0];
    const score = r => r.r2 + 0.003 * Math.min(r.nCycles, 30);
    good.sort((a, b) => score(b) - score(a));
    return good[0];
  }

  return { analyze, modelAt, spectrum, linreg };
})();

if (typeof module !== 'undefined') module.exports = Analysis;
