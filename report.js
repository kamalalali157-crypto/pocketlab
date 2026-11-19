/* ============================================================
   report.js — error analysis + lab-report builder
   ============================================================ */
'use strict';

const Report = (() => {

  /* derived values: k, c, comparison with theory */
  function derive(ctx) {
    const r = ctx.res, th = ctx.theory || null;
    const meff = th && th.meff ? th.meff : null;
    const out = { meff, fth: th && th.f ? th.f : null };
    if (meff) { out.k = meff * r.wn * r.wn; out.c = 2 * r.zeta * meff * r.wn; }
    if (out.fth) out.err = (r.fn - out.fth) / out.fth * 100;
    return out;
  }

  /* smart error analysis: each note has a UI version (second person) and a report version (formal) */
  function diagnose(ctx) {
    const r = ctx.res, d = derive(ctx), exp = ctx.exp, L = [];
    const add = (level, ui, en) => L.push({ level, ui, en });

    if (d.err != null) {
      const e = Math.abs(d.err);
      if (e < 5) add('good', `Excellent agreement with theory (${e.toFixed(1)} % error).`, `Agreement with theory is very good (${e.toFixed(1)} % deviation), which supports the validity of the model assumptions.`);
      else if (d.err < 0) add(e > 15 ? 'bad' : 'warn',
        `The measured frequency is ${e.toFixed(1)} % below theory. Most likely there is extra mass you did not account for (tape, sticker, phone case), or the clamp is not rigid so the effective length is longer than you measured.`,
        `The measured frequency is ${e.toFixed(1)} % lower than predicted. Likely causes are additional unaccounted mass (tape, marker, phone case) or a support that is not perfectly rigid, which increases the effective length and reduces the effective stiffness.`);
      else add(e > 15 ? 'bad' : 'warn',
        `The measured frequency is ${e.toFixed(1)} % above theory. The effective length may be shorter than measured, the mass may have been overestimated, or the material's true E may be higher than assumed.`,
        `The measured frequency is ${e.toFixed(1)} % higher than predicted. Possible causes are an effective length shorter than measured, an overestimated mass, or a true elastic modulus higher than the handbook value assumed.`);
    }
    if (r.r2Type === 'waveform' && r.r2 < 0.9)
      add('warn', `The fit quality is moderate (R² = ${r.r2.toFixed(3)}). There is noise, or the motion is not a clean free vibration (your hand touched the object, or more than one mode is vibrating).`,
        `The goodness of fit is moderate (R² = ${r.r2.toFixed(3)}), indicating measurement noise or a response that is not a pure single-mode free vibration (e.g. contact during release or participation of other modes).`);
    if (r.zeta > 0.1 && !(exp.typical))
      add('warn', `The damping is high (ζ = ${num(r.zeta)}). Possible causes: friction at the clamp, air resistance, or a loosely attached phone.`,
        `The damping is relatively high (ζ = ${num(r.zeta)}), possibly due to friction at the support, aerodynamic drag, or a loosely attached sensor.`);
    if (r.sigmaEarly != null && r.sigmaLate > 0) {
      const ratio = r.sigmaEarly / r.sigmaLate;
      if (ratio > 1.5) add('info', `The decay is faster at large amplitudes, so part of the damping is not viscous (e.g. air drag, which grows with speed).`,
        `The decay rate is higher at large amplitudes (σ early/late = ${ratio.toFixed(2)}), suggesting a non-viscous contribution such as quadratic aerodynamic drag.`);
      else if (ratio < 0.67) add('info', `The decay is faster at small amplitudes, a sign of dry (Coulomb) friction at the support.`,
        `The decay rate is higher at small amplitudes (σ early/late = ${ratio.toFixed(2)}), which is characteristic of dry (Coulomb) friction at the support.`);
    }
    if (r.nCycles < 5)
      add('warn', `Only ${r.nCycles} cycles were analysed. Use a larger initial displacement or less damping for a more precise result.`,
        `Only ${r.nCycles} cycles could be analysed; a larger initial displacement or lower damping would improve the precision of the estimates.`);
    if (r.samplesPerCycle < 10)
      add('warn', `The sampling rate (${r.fs.toFixed(0)} Hz) gives only ${r.samplesPerCycle.toFixed(1)} points per cycle, so peaks may be measured smaller than they really are. Use the microphone for high frequencies.`,
        `The sampling rate (${r.fs.toFixed(0)} Hz) provides only ${r.samplesPerCycle.toFixed(1)} samples per cycle, so peak amplitudes may be under-resolved; a higher-rate sensor (e.g. the microphone) is preferable for high frequencies.`);
    if (r.mode === 'accel' && exp.id !== 'cantilever' && exp.id !== 'car')
      add('info', `The phone's mass (about 190 g) is part of the vibrating mass. If you leave it out, the theoretical frequency will come out too high.`,
        `The phone mass (≈ 190 g) forms part of the vibrating mass; neglecting it would lead to an overestimated theoretical frequency.`);
    if (r.mode === 'camera')
      add('info', `Camera measurements are affected by perspective and pixel resolution. Keep the camera square to the plane of motion and make sure the marker stands out.`,
        `Video tracking is affected by perspective and pixel resolution; the camera axis must be perpendicular to the plane of motion and the marker must contrast with the background.`);
    if (exp.typical) {
      const t = exp.typical, okF = r.fn >= t.f[0] * 0.8 && r.fn <= t.f[1] * 1.2, okZ = r.zeta >= t.zeta[0] * 0.7 && r.zeta <= t.zeta[1] * 1.3;
      add(okF && okZ ? 'good' : 'warn',
        `Typical car suspension values: f = ${t.f[0]}–${t.f[1]} Hz and ζ = ${t.zeta[0]}–${t.zeta[1]}. ${okF && okZ ? 'Your result is within this range.' : 'Your result is outside this range; the shock absorbers may be worn, or the measurement was affected by another motion.'}`,
        `Typical passenger-car suspension values are f = ${t.f[0]}–${t.f[1]} Hz and ζ = ${t.zeta[0]}–${t.zeta[1]}. ${okF && okZ ? 'The measured values fall within this range.' : 'The measured values fall outside this range, which may indicate worn dampers or contamination by other motions.'}`);
    }
    return L;
  }

  /* render charts on a white background for the report */
  function chartImg(opts) {
    const c = document.createElement('canvas');
    Chart.draw(c, Object.assign({ light: true, width: 1000, height: 400, fontSize: 15 }, opts));
    return c.toDataURL('image/png');
  }

  /* data fingerprint (FNV-1a) */
  function fingerprint(y) {
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    const f = new Float32Array(y), b = new Uint8Array(f.buffer);
    for (let i = 0; i < b.length; i++) { h1 ^= b[i]; h1 = Math.imul(h1, 16777619) >>> 0; h2 = Math.imul(h2 ^ b[i], 2246822519) >>> 0; }
    return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).toUpperCase();
  }

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function build(ctx) {
    const { exp, res: r, rec, form, photo, predictions } = ctx;
    const d = derive(ctx), diag = diagnose(ctx);
    const unit = rec.unit;
    const [i0, i1] = r.fit;
    const tS = Array.from(r.t.subarray(r.region[0], r.region[1] + 1)), yS = Array.from(r.y.subarray(r.region[0], r.region[1] + 1));
    const tM = [], yM = []; for (let i = i0; i <= i1; i += Math.max(1, Math.floor((i1 - i0) / 1500))) { tM.push(r.t[i]); yM.push(Analysis.modelAt(r.model, r.t[i])); }

    const imgSignal = chartImg({
      title: 'Figure 1 – Recorded free-vibration signal and fitted damped-sinusoid model',
      xlabel: 'Time t (s)', ylabel: `${rec.quantity} (${unit})`,
      series: [
        { x: tS, y: yS, color: '#9ca3af', width: 1.2, label: 'Measured' },
        { x: tM, y: yM, color: '#2563eb', width: 2, label: 'Fitted model' },
        { x: r.peaks.map(p => p.t), y: r.peaks.map(p => Analysis.modelAt(r.model, p.t)), type: 'points', color: '#dc2626', r: 3.5, label: 'Peaks' }
      ]
    });
    const imgDecay = chartImg({
      title: 'Figure 2 – Logarithmic amplitude decay (slope = −σ)',
      xlabel: 'Time t (s)', ylabel: 'ln(A)',
      series: [
        { x: r.peaks.map(p => p.t), y: r.peaks.map(p => Math.log(p.a)), type: 'points', color: '#dc2626', r: 4, label: 'ln A (measured)' },
        { x: [r.peaks[0].t, r.peaks[r.peaks.length - 1].t], y: [r.lnFit.a + r.lnFit.b * r.peaks[0].t, r.lnFit.a + r.lnFit.b * r.peaks[r.peaks.length - 1].t], color: '#2563eb', width: 2, label: 'Linear fit' }
      ]
    });
    const imgSpec = chartImg({
      title: 'Figure 3 – Frequency spectrum (FFT) of the free-vibration record',
      xlabel: 'Frequency f (Hz)', ylabel: 'Amplitude', height: 340,
      series: [{ x: r.spec.f, y: r.spec.mag, color: '#7c3aed', width: 1.6 }]
    });

    const pk = r.peaks, nShow = Math.min(pk.length, 12);
    const peakRows = pk.slice(0, nShow).map((p, i) => `<tr><td>${i + 1}</td><td>${p.t.toFixed(4)}</td><td>${num(p.a, 4)}</td><td>${Math.log(p.a).toFixed(4)}</td></tr>`).join('')
      + (pk.length > nShow ? `<tr><td colspan="4" class="muted">… ${pk.length - nShow} more peaks analysed</td></tr>` : '');

    const theoryHTML = ctx.theory && ctx.theory.lines && ctx.theory.lines.length ? ctx.theory.lines.map(l => `<div class="eq">${l}</div>`).join('') : '';
    const proc = [...exp.setupEn,
      `Data were acquired with the ${MODE_EN[r.mode]} at an effective sampling rate of ${r.fs.toFixed(r.fs > 1000 ? 0 : 1)} Hz (${r.rawSamples} raw samples, ${r.duration.toFixed(2)} s).`,
      r.mode === 'mic' ? 'The record was band-pass filtered around the dominant frequency (zero-phase, Q = 2) to isolate the fundamental mode.'
        : 'The record was resampled to a uniform time base, the mean was removed and a zero-phase moving-average low-pass filter was applied.',
      `The free-decay region was detected automatically and ${pk.length} successive peaks were extracted (amplitude = half the peak-to-trough height, which is insensitive to offsets).`,
      r.method === 'nelder-mead' ? 'A damped-sinusoid model was fitted to the raw signal by least squares (Nelder–Mead simplex), initialised from the peak analysis.' : 'The decay parameters were obtained from linear regression of ln(A) against time.'
    ];
    const predDone = (predictions || []).filter(p => p.measured != null);
    if (predDone.length) proc.push(`To test the model, additional masses were added (Δm = ${predDone.map(p => p.dm + ' g').join(', ')}); the outcome was predicted before each measurement and the measurement was then repeated.`);

    const wnLine = `ω<sub>n</sub> = √(ω<sub>d</sub>² + σ²) = √(${fmt(r.wd)}² + ${fmt(r.sigma)}²) = ${fmt(r.wn)} rad/s &nbsp;⇒&nbsp; <b>f<sub>n</sub> = ω<sub>n</sub>/2π = ${fmt(r.fn)} Hz</b>`;
    const errRow = d.fth ? `<div class="eq">Percent difference = (f<sub>n,meas</sub> − f<sub>n,theory</sub>)/f<sub>n,theory</sub> × 100 = (${fmt(r.fn)} − ${fmt(d.fth)})/${fmt(d.fth)} × 100 = <b>${d.err.toFixed(2)} %</b></div>` : '';

    const predTable = predDone.length ? `
      <h3>5.4 Prediction test</h3>
      <table><tr><th>Added mass Δm (g)</th><th>Student prediction (Hz)</th><th>Model prediction (Hz)</th><th>Measured (Hz)</th><th>Model error (%)</th></tr>
      ${predDone.map(p => `<tr><td>${p.dm}</td><td>${num(p.guess, 4)}</td><td>${num(p.theory, 4)}</td><td>${num(p.measured, 4)}</td><td>${((p.theory - p.measured) / p.measured * 100).toFixed(2)}</td></tr>`).join('')}
      </table>` : '';

    const conclusion = form.conclusion && form.conclusion.trim()
      ? form.conclusion.trim().split(/\n+/).map(p => `<p>${esc(p)}</p>`).join('')
      : '<p class="placeholder">[Conclusion to be written by the student. Summarise the measured f<sub>n</sub> and ζ, their agreement with theory, the main sources of error, and possible improvements.]</p>';

    const date = form.date ? new Date(form.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

    return `
<article class="report" dir="ltr" lang="en">
  <section class="cover">
    <div class="inst">${esc(form.institution)}</div>
    ${form.course ? `<div class="course">${esc(form.course)}</div>` : ''}
    <div class="rtype">Laboratory Report</div>
    <h1>${esc(form.title)}</h1>
    <table class="cover-tbl">
      <tr><th>Presented by</th><td>${esc(form.by).replace(/\n/g, '<br>')}</td></tr>
      <tr><th>Presented to</th><td>${esc(form.to)}</td></tr>
      <tr><th>Date</th><td>${date}</td></tr>
    </table>
  </section>

  <h2>1. Objective</h2>
  <p>${esc(form.objective)}</p>

  <h2>2. Experimental Setup</h2>
  <h3>2.1 Equipment</h3>
  <ul>${exp.equipment.map(e => `<li>${esc(e)}</li>`).join('')}</ul>
  <h3>2.2 Configuration</h3>
  <p>The vibration was measured with the ${MODE_EN[r.mode]}${rec.meta && rec.meta.axis ? ` along the ${rec.meta.axis} axis` : ''}. The system is modelled as a single-degree-of-freedom mass–spring–damper governed by
  <span class="eq inline">m·ẍ + c·ẋ + k·x = 0</span>, whose under-damped free response is
  <span class="eq inline">x(t) = A·e<sup>−σt</sup>·cos(ω<sub>d</sub>t + φ)</span> with σ = ζω<sub>n</sub> and ω<sub>d</sub> = ω<sub>n</sub>√(1 − ζ²).</p>
  ${photo ? `<figure><img src="${photo}" alt="Experimental setup"><figcaption>Photograph of the experimental setup.</figcaption></figure>` : ''}

  <h2>3. Procedure</h2>
  <ol>${proc.map(p => `<li>${esc(p)}</li>`).join('')}</ol>

  <h2>4. Data and Observations</h2>
  <table>
    <tr><th>Measurement method</th><td>${esc(MODE_EN[r.mode])}</td></tr>
    <tr><th>Measured quantity</th><td>${esc(rec.quantity)} (${esc(unit)})</td></tr>
    <tr><th>Sampling rate</th><td>${r.fs.toFixed(1)} Hz (${r.samplesPerCycle.toFixed(1)} samples per cycle)</td></tr>
    <tr><th>Record length</th><td>${r.duration.toFixed(2)} s</td></tr>
    <tr><th>Cycles analysed</th><td>${pk.length}</td></tr>
    ${ctx.inputsTable || ''}
  </table>
  <figure><img src="${imgSignal}" alt="Signal"></figure>
  <h3>Table 1 – Successive peak amplitudes</h3>
  <table><tr><th>n</th><th>t<sub>n</sub> (s)</th><th>A<sub>n</sub> (${esc(unit)})</th><th>ln A<sub>n</sub></th></tr>${peakRows}</table>
  <p><b>Observations.</b> The response is a decaying oscillation, confirming an under-damped system (ζ &lt; 1). The amplitude decreased from ${num(pk[0].a)} to ${num(pk[pk.length - 1].a)} ${esc(unit)} over ${(pk[pk.length - 1].t - pk[0].t).toFixed(2)} s, while the period remained constant within ${isFinite(r.fdSE) ? (r.fdSE / r.fd * 100).toFixed(2) : '—'} %, as expected for a linear system. The FFT spectrum shows a dominant peak at ${num(r.fSpec, 4)} Hz.</p>
  <figure><img src="${imgSpec}" alt="Spectrum"></figure>

  <h2>5. Analysis and Calculations</h2>
  <h3>5.1 Damped frequency</h3>
  <div class="eq">T<sub>d</sub> = ${fmt(r.Td)} s &nbsp;⇒&nbsp; f<sub>d</sub> = 1/T<sub>d</sub> = ${fmt(r.fd)} Hz, &nbsp; ω<sub>d</sub> = 2πf<sub>d</sub> = ${fmt(r.wd)} rad/s</div>
  <h3>5.2 Damping</h3>
  <figure><img src="${imgDecay}" alt="Decay"></figure>
  <div class="eq">Decay rate (slope of ln A vs t): σ = ${fmt(r.sigma)} ${isFinite(r.sigmaSE) ? `± ${fmt(r.sigmaSE, 2)}` : ''} s<sup>−1</sup></div>
  <div class="eq">Logarithmic decrement: δ = σ·T<sub>d</sub> = ${fmt(r.sigma)} × ${fmt(r.Td)} = ${fmt(r.delta)}</div>
  <div class="eq">${wnLine}</div>
  <div class="eq">Damping ratio: ζ = σ/ω<sub>n</sub> = ${fmt(r.sigma)}/${fmt(r.wn)} = <b>${fmt(r.zeta)}</b> ${isFinite(r.zetaSE) ? `± ${fmt(r.zetaSE, 2)}` : ''} &nbsp; (check: δ/√(4π² + δ²) = ${fmt(r.delta / Math.sqrt(4 * Math.PI ** 2 + r.delta ** 2))})</div>
  <div class="eq">Quality factor Q = 1/(2ζ) = ${fmt(r.Q)}; &nbsp; time constant τ = 1/σ = ${fmt(r.tau)} s</div>
  ${d.meff ? `<div class="eq">Stiffness: k = m<sub>eff</sub>·ω<sub>n</sub>² = ${fmt(d.meff)} × ${fmt(r.wn)}² = <b>${fmt(d.k)} N/m</b></div>
  <div class="eq">Damping coefficient: c = 2ζm<sub>eff</sub>ω<sub>n</sub> = 2 × ${fmt(r.zeta)} × ${fmt(d.meff)} × ${fmt(r.wn)} = <b>${fmt(d.c)} N·s/m</b></div>` : ''}
  <div class="eq">Goodness of fit: R² = ${r.r2.toFixed(4)} (${r.r2Type === 'waveform' ? 'full waveform fit' : 'log-amplitude regression'})</div>
  ${theoryHTML || errRow ? `<h3>5.3 Comparison with theory</h3>${theoryHTML}${errRow}` : ''}
  ${predTable}
  <h3>${predTable ? '5.5' : theoryHTML ? '5.4' : '5.3'} Sources of error</h3>
  <ul>${diag.map(x => `<li>${x.en}</li>`).join('')}</ul>

  <h2>6. Conclusion</h2>
  ${conclusion}

  <footer class="rep-foot">Generated with PocketLab · data fingerprint ${fingerprint(r.y)}</footer>
</article>`;
  }

  return { build, diagnose, derive, fingerprint };
})();
