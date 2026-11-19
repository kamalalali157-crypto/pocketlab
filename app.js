/* ============================================================
   app.js — wires the UI to everything
   ============================================================ */
'use strict';

(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  const state = {
    exp: null, inputs: {}, theory: null, photo: null, mode: 'accel',
    rec: null, res: null, predictions: [], pending: null,
    recording: false, twinRAF: null
  };

  /* ---------- helpers ---------- */
  function toast(msg, ms = 3500) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
  }
  function setStatus(msg, bad = false) { const s = $('#recStatus'); s.textContent = msg; s.classList.toggle('bad', bad); }
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem('pl_' + k)) ?? d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('pl_' + k, JSON.stringify(v)); } catch (e) { } }
  };
  function ctx() { return { exp: state.exp, inputs: state.inputs, theory: state.theory, res: state.res, rec: state.rec, photo: state.photo, predictions: state.predictions }; }

  /* ---------- navigation ---------- */
  function showStep(n) {
    if (n >= 2 && !state.exp) { toast('Choose an experiment first'); n = 1; }
    if (n >= 3 && !state.res && n !== 2) { toast('Record a measurement first'); n = state.exp ? 2 : 1; }
    $$('.step').forEach(s => s.classList.toggle('active', s.id === 'step' + n));
    $$('#stepsNav button').forEach(b => b.classList.toggle('active', +b.dataset.step === n));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    stopTwin();
    if (n !== 2) { closeCamera(); if (state.recording) cancelRecording(); }
    if (n === 2) setMode(state.mode);
    if (n === 3) { renderAnalysis(); startTwin(); }
    if (n === 4) renderPredict();
    if (n === 5) fillReportForm();
  }
  $('#stepsNav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) showStep(+b.dataset.step); });

  /* ================= 1. Experiment ================= */
  function renderExperiments() {
    $('#expGrid').innerHTML = EXPERIMENTS.map(e => `
      <button class="exp-card" data-id="${e.id}">
        <span class="ico">${e.icon}</span><b>${e.title}</b><small dir="ltr">${e.en}</small>
        <span class="tag">${MODE_NAMES[e.mode]}</span>
      </button>`).join('');
  }
  $('#expGrid').addEventListener('click', e => { const b = e.target.closest('.exp-card'); if (b) selectExperiment(b.dataset.id); });

  function selectExperiment(id) {
    const e = state.exp = EXPERIMENTS.find(x => x.id === id);
    state.mode = e.mode; state.res = null; state.rec = null; state.predictions = [];
    $$('.exp-card').forEach(c => c.classList.toggle('selected', c.dataset.id === id));
    $('#expDetails').hidden = false;
    $('#expTitle').textContent = `${e.icon} ${e.title}`;
    $('#expDesc').textContent = e.desc;
    $('#expEquip').innerHTML = e.equipment.map(x => `<li>${x}</li>`).join('');
    $('#expSetup').innerHTML = e.setup.map(x => `<li>${x}</li>`).join('');
    const saved = store.get('inputs_' + id, {});
    $('#theoryInputs').innerHTML = e.inputs.length ? e.inputs.map(i => `
      <label>${i.label}<input type="number" step="any" id="in_${i.id}" value="${saved[i.id] ?? i.def}"></label>`).join('')
      : '<p class="hint">No measurements are needed for this experiment.</p>';
    $('#expDetails').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function readInputs() {
    const v = {}, raw = {};
    state.exp.inputs.forEach(i => { const el = $('#in_' + i.id); raw[i.id] = el.value; v[i.id] = el.value === '' ? NaN : parseFloat(el.value); });
    store.set('inputs_' + state.exp.id, raw);
    state.inputs = v; state.theory = state.exp.theory(v);
  }

  $('#setupPhoto').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 1200 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = img.width * s; c.height = img.height * s;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      state.photo = c.toDataURL('image/jpeg', 0.85);
      $('#photoPreview').src = state.photo; $('#photoPreview').hidden = false;
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(f);
  });

  $('#toRecord').addEventListener('click', () => { readInputs(); showStep(2); });

  /* ================= 2. Recording ================= */
  function setMode(m) {
    state.mode = m;
    $$('#modeTabs button').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
    $$('.mode-panel').forEach(p => p.hidden = p.dataset.panel !== m);
    if (m !== 'camera') closeCamera();
    setRecUI(false); setStatus('');
    const p = state.pending != null ? state.predictions[state.pending] : null;
    $('#predBanner').hidden = !p;
    if (p) $('#predBanner').innerHTML = `🎯 Prediction test: add <b>${p.dm} g</b> to the object, then record exactly as before. Your prediction was <b>${num(p.guess, 4)} Hz</b>.`;
    Chart.draw($('#liveChart'), { series: [], empty: 'Live signal will appear here' });
  }
  $('#modeTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b && !state.recording) setMode(b.dataset.mode); });

  function setRecUI(on, label) {
    state.recording = on;
    const b = $('#recBtn');
    b.textContent = on ? (label || '■ Stop') : '● Start recording';
    b.classList.toggle('stop', on);
    $$('#modeTabs button').forEach(x => x.disabled = on);
  }

  /* camera */
  async function openCamera() {
    Sensors.camera.onInfo = msg => { $('#camInfo').textContent = msg; };
    await Sensors.camera.open($('#video'), $('#overlay'));
    $('#camStart').textContent = '✅ Camera on';
  }
  function closeCamera() { if (Sensors.camera.running) { Sensors.camera.close(); $('#camStart').textContent = '📷 Turn on camera'; $('#camInfo').textContent = 'Camera off'; } }
  $('#camStart').addEventListener('click', async () => { try { if (!Sensors.camera.running) await openCamera(); } catch (e) { toast('⚠️ ' + e.message); } });
  $('#overlay').addEventListener('click', e => { if (Sensors.camera.running) { Sensors.camera.pick(e.clientX, e.clientY); toast('Color selected ✅'); } });
  $('#tol').addEventListener('input', e => Sensors.camera.tol = +e.target.value);

  $('#recBtn').addEventListener('click', () => state.recording ? stopRecording() : startRecording());

  async function startRecording() {
    const m = state.mode; setStatus('');
    try {
      if (m === 'demo') {
        finishRecording(Sensors.demo.generate(+$('#demoF').value, +$('#demoZ').value, +$('#demoN').value)); return;
      }
      if (m === 'mic') {
        setRecUI(true, '✕ Cancel'); setStatus('Measuring room noise...');
        await Sensors.mic.start(
          () => setStatus('✅ Ready! Strike the object now'),
          () => setStatus('🎙️ Recording...'),
          rec => { setRecUI(false); finishRecording(rec); }, 3);
        micMeter(); return;
      }
      if (m === 'accel') await Sensors.accel.start();
      if (m === 'camera') {
        if (!Sensors.camera.running) await openCamera();
        if (!Sensors.camera.target) throw new Error('First tap the marker in the video to select its color.');
        Sensors.camera.startRec();
      }
      setRecUI(true); state.t0 = performance.now(); liveLoop();
    } catch (e) { setRecUI(false); setStatus('⚠️ ' + e.message, true); }
  }

  function micMeter() {
    if (!state.recording || state.mode !== 'mic') { $('#micLevel').style.width = '0'; return; }
    $('#micLevel').style.width = Math.min(100, Sensors.mic.level * 300) + '%';
    requestAnimationFrame(micMeter);
  }

  function liveLoop() {
    if (!state.recording || state.mode === 'mic') return;
    const now = performance.now();
    if (!liveLoop.last || now - liveLoop.last > 120) {
      liveLoop.last = now;
      const L = Sensors[state.mode].live();
      const sec = ((now - state.t0) / 1000).toFixed(1);
      if (L) {
        const tEnd = L.t[L.t.length - 1];
        Chart.draw($('#liveChart'), { series: [{ x: L.t.map(v => v - L.t[0]), y: L.y, color: '#38bdf8' }], xmin: Math.max(0, tEnd - L.t[0] - 10), xlabel: 't (s)' });
        setStatus(`● ${sec} s · ${L.n} samples`);
      } else setStatus(`● ${sec} s · waiting for data...`);
    }
    requestAnimationFrame(liveLoop);
  }

  function stopRecording() {
    const m = state.mode;
    if (m === 'mic') { cancelRecording(); return; }
    try {
      const rec = m === 'camera' ? Sensors.camera.stop(parseFloat($('#pxPerCm').value)) : Sensors.accel.stop();
      setRecUI(false); finishRecording(rec);
    } catch (e) { setRecUI(false); setStatus('⚠️ ' + e.message, true); }
  }
  function cancelRecording() {
    if (state.mode === 'mic') Sensors.mic.close();
    if (state.mode === 'accel') try { Sensors.accel.stop(); } catch (e) { }
    if (state.mode === 'camera') Sensors.camera.recording = false;
    setRecUI(false); setStatus('Recording cancelled');
  }

  function finishRecording(rec) {
    setStatus('⏳ Analysing...');
    setTimeout(() => {
      const res = Analysis.analyze(rec, { fmin: rec.mode === 'mic' ? 20 : 0.2 });
      if (!res.ok) { setStatus('⚠️ ' + res.error, true); return; }
      setStatus('');
      if (state.pending != null) {
        const p = state.predictions[state.pending];
        p.measured = res.fn; p.zeta = res.zeta; state.pending = null;
        showStep(4); return;
      }
      state.rec = rec; state.res = res;
      showStep(3);
    }, 30);
  }

  /* ================= 3. Analysis ================= */
  function renderAnalysis() {
    const r = state.res, d = Report.derive(ctx()), u = state.rec.unit;
    const kpi = (lbl, val, sub = '', cls = '') => `<div class="kpi ${cls}"><small>${lbl}</small><b>${val}</b><span>${sub}</span></div>`;
    $('#kpis').innerHTML =
      kpi('Natural frequency f<sub>n</sub>', `${num(r.fn, 4)} Hz`, `ω<sub>n</sub> = ${num(r.wn, 4)} rad/s`, 'hero') +
      kpi('Damping ratio ζ', num(r.zeta, 3), isFinite(r.zetaSE) ? `± ${num(r.zetaSE, 2)}` : '', 'hero') +
      kpi('Period T<sub>d</sub>', `${num(r.Td, 4)} s`, `f<sub>d</sub> = ${num(r.fd, 4)} Hz`) +
      kpi('Log decrement δ', num(r.delta, 3), `Q = ${num(r.Q, 3)}`) +
      kpi('Fit quality R²', r.r2.toFixed(3), r.r2Type === 'waveform' ? 'full waveform' : 'envelope') +
      kpi('Cycles analysed', r.nCycles, `${r.fs.toFixed(0)} Hz sampling`) +
      (d.k ? kpi('Stiffness k', `${num(d.k, 4)} N/m`, `m<sub>eff</sub> = ${num(d.meff, 3)} kg`) : '') +
      (d.c ? kpi('Damping coefficient c', `${num(d.c, 3)} N·s/m`) : '') +
      (d.fth ? kpi('Error vs theory', `${d.err >= 0 ? '+' : ''}${d.err.toFixed(1)}%`, `f<sub>th</sub> = ${num(d.fth, 4)} Hz`, Math.abs(d.err) < 5 ? 'good' : Math.abs(d.err) < 15 ? 'warn' : 'bad') : '');

    const [a, b] = r.region, [i0, i1] = r.fit;
    const tS = Array.from(r.t.subarray(a, b + 1)), yS = Array.from(r.y.subarray(a, b + 1));
    const tM = [], yM = [], st = Math.max(1, Math.floor((i1 - i0) / 2000));
    for (let i = i0; i <= i1; i += st) { tM.push(r.t[i]); yM.push(Analysis.modelAt(r.model, r.t[i])); }
    Chart.draw($('#fitChart'), {
      xlabel: 't (s)', ylabel: `${state.rec.quantity} (${u})`,
      series: [
        { x: tS, y: yS, color: '#64748b', width: 1.2, label: 'Measured' },
        { x: tM, y: yM, color: '#38bdf8', width: 2, label: 'Model' },
        { x: r.peaks.map(p => p.t), y: r.peaks.map(p => Analysis.modelAt(r.model, p.t)), type: 'points', color: '#f43f5e', label: 'Peaks' }
      ]
    });
    Chart.draw($('#specChart'), { xlabel: 'f (Hz)', series: [{ x: r.spec.f, y: r.spec.mag, color: '#a78bfa', width: 1.5 }] });
    const p0 = r.peaks[0].t, pN = r.peaks[r.peaks.length - 1].t;
    Chart.draw($('#decChart'), {
      xlabel: 't (s)', ylabel: 'ln A',
      series: [
        { x: r.peaks.map(p => p.t), y: r.peaks.map(p => Math.log(p.a)), type: 'points', color: '#f43f5e' },
        { x: [p0, pN], y: [r.lnFit.a + r.lnFit.b * p0, r.lnFit.a + r.lnFit.b * pN], color: '#38bdf8', width: 2 }
      ]
    });

    let html = '';
    if (state.theory && state.theory.lines && state.theory.lines.length)
      html += `<div class="theory" dir="ltr">${state.theory.lines.map(l => `<div>${l}</div>`).join('')}</div>`;
    else html += `<p class="hint">No theoretical value to compare with. Add your measurements in step 1 if you want a comparison.</p>`;
    html += '<ul class="diag">' + Report.diagnose(ctx()).map(x => `<li class="${x.level}">${x.ui}</li>`).join('') + '</ul>';
    if (r.mode === 'demo' && state.rec.meta) html += `<p class="hint">🧪 True values of the synthetic data: f<sub>n</sub> = ${state.rec.meta.fnTrue} Hz, ζ = ${state.rec.meta.zetaTrue}. Compare them with what the analysis found.</p>`;
    $('#errorBox').innerHTML = html;
  }

  /* ---------- digital twin ---------- */
  function twinParams() {
    const r = state.res, mf = 2 ** +$('#mFactor').value, cf = 2 ** +$('#cFactor').value;
    const wn = r.wn / Math.sqrt(mf), zeta = r.zeta * cf / Math.sqrt(mf);
    return { mf, cf, wn, zeta, fn: wn / (2 * Math.PI) };
  }
  function twinX(p, tau) {   // normalised free response (x(0)=1, v(0)=0)
    const { wn, zeta } = p;
    if (zeta < 1) { const wd = wn * Math.sqrt(1 - zeta * zeta), s = zeta * wn; return Math.exp(-s * tau) * (Math.cos(wd * tau) + s / wd * Math.sin(wd * tau)); }
    if (Math.abs(zeta - 1) < 1e-6) return (1 + wn * tau) * Math.exp(-wn * tau);
    const q = wn * Math.sqrt(zeta * zeta - 1);
    return Math.exp(-zeta * wn * tau) * (Math.cosh(q * tau) + zeta * wn / q * Math.sinh(q * tau));
  }
  function updateTwinInfo() {
    const p = twinParams(), r = state.res;
    $('#mfVal').textContent = '×' + num(p.mf, 2); $('#cfVal').textContent = '×' + num(p.cf, 2);
    const type = p.zeta < 1 ? 'under-damped (oscillates)' : Math.abs(p.zeta - 1) < 0.02 ? 'critically damped' : 'over-damped (no oscillation)';
    $('#twinInfo').innerHTML = `Model: f<sub>n</sub> = <b>${num(p.fn, 4)} Hz</b> · ζ = <b>${num(p.zeta, 3)}</b> · ${type}` +
      (p.mf !== 1 ? ` · note: f ∝ 1/√m, so the frequency changed by ×${num(1 / Math.sqrt(p.mf), 3)}` : '');
  }
  $('#mFactor').addEventListener('input', updateTwinInfo);
  $('#cFactor').addEventListener('input', updateTwinInfo);

  function startTwin() {
    const cv = $('#twinCanvas'), r = state.res;
    $('#mFactor').value = 0; $('#cFactor').value = 0; updateTwinInfo();
    const [i0, i1] = r.fit, tA = r.t[i0], dur = r.t[i1] - tA;
    const slow = r.fd > 1.5 ? r.fd / 1.5 : 1;
    let A0 = 0; for (let i = i0; i <= i1; i++) A0 = Math.max(A0, Math.abs(r.yf[i] - r.model.c));
    const start = performance.now();
    const frame = now => {
      const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
      if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      const tau = ((now - start) / 1000 / slow) % dur;
      const k = i0 + Math.min(i1 - i0, Math.round(tau * r.fs));
      const real = (r.yf[k] - r.model.c) / A0;
      const p = twinParams();
      const twin = p.mf === 1 && p.cf === 1 ? (Analysis.modelAt(r.model, tA + tau) - r.model.c) / A0 : twinX(p, tau) * r.model.A / A0;
      drawSystem(g, W * 0.27, H, real, '#94a3b8', 'Reality (your data)');
      drawSystem(g, W * 0.73, H, twin, '#38bdf8', 'Digital twin');
      g.fillStyle = '#64748b'; g.font = '12px system-ui'; g.textAlign = 'center';
      g.fillText(`t = ${tau.toFixed(2)} s${slow > 1 ? ` (slowed ×${slow.toFixed(1)})` : ''}`, W / 2, H - 8);
      state.twinRAF = requestAnimationFrame(frame);
    };
    state.twinRAF = requestAnimationFrame(frame);
  }
  function stopTwin() { if (state.twinRAF) cancelAnimationFrame(state.twinRAF); state.twinRAF = null; }

  function drawSystem(g, cx, H, x, color, label) {
    const top = 34, rest = H * 0.55, amp = H * 0.2, y = rest + Math.max(-1.6, Math.min(1.6, -x)) * amp;
    g.fillStyle = '#334155'; g.fillRect(cx - 50, top - 8, 100, 8);
    g.strokeStyle = color; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, top);
    const coils = 10, len = y - 22 - top;
    for (let i = 1; i <= coils * 2; i++) g.lineTo(cx + (i % 2 ? 14 : -14), top + len * i / (coils * 2 + 1));
    g.lineTo(cx, y - 22); g.stroke();
    g.fillStyle = color; g.beginPath(); g.roundRect ? g.roundRect(cx - 26, y - 22, 52, 44, 6) : g.rect(cx - 26, y - 22, 52, 44); g.fill();
    g.setLineDash([4, 4]); g.strokeStyle = '#475569'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx - 60, rest); g.lineTo(cx + 60, rest); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#cbd5e1'; g.font = 'bold 13px system-ui'; g.textAlign = 'center'; g.fillText(label, cx, 20);
  }

  $('#reRecord').addEventListener('click', () => showStep(2));
  $('#toPredict').addEventListener('click', () => showStep(4));
  $('#dlCsv').addEventListener('click', () => {
    const r = state.res, rows = ['t_s,signal,filtered,model'];
    for (let i = 0; i < r.n; i++) rows.push(`${r.t[i].toFixed(6)},${r.y[i]},${r.yf[i]},${i >= r.fit[0] && i <= r.fit[1] ? Analysis.modelAt(r.model, r.t[i]) : ''}`);
    download(`pocketlab_${state.exp.id}.csv`, rows.join('\n'), 'text/csv');
  });

  /* ================= 4. Predict & compare ================= */
  function renderPredict() {
    const e = state.exp, r = state.res, body = $('#predictBody');
    if (e.noPredict) { body.innerHTML = `<div class="card"><p>This experiment has no mass-change prediction. You can go straight to the report.</p></div>`; return; }
    const meff = state.theory && state.theory.meff;
    if (!meff && !e.predict) { body.innerHTML = `<div class="card"><p>To make a prediction you need the effective mass. Go back to step 1 and enter the mass.</p></div>`; return; }
    const rows = state.predictions.map((p, i) => {
      const done = p.measured != null;
      let verdict = '';
      if (done) {
        const eg = Math.abs(p.guess - p.measured), et = Math.abs(p.theory - p.measured);
        verdict = eg < et ? '👏 Your prediction beat the model!' : Math.abs(p.theory - p.measured) / p.measured < 0.05 ? '✅ The model was right. Think about why your guess differed.' : '🤔 Both were off. Is some factor missing?';
      }
      return `<tr><td>${p.dm}</td><td>${num(p.guess, 4)}</td><td>${num(p.theory, 4)}</td>
        <td>${done ? num(p.measured, 4) : `<button class="small" data-measure="${i}">Measure now →</button>`}</td>
        <td>${done ? ((p.theory - p.measured) / p.measured * 100).toFixed(1) + '%' : '—'}</td><td>${verdict}</td></tr>`;
    }).join('');
    body.innerHTML = `
      <div class="card">
        <p>Your baseline measurement: <b>f<sub>n</sub> = ${num(r.fn, 4)} Hz</b>${meff ? ` with an effective mass of <b>${num(meff * 1000, 4)} g</b>` : ''}.</p>
        <p class="lead">The question: <b>if you add a mass Δm, what happens to the frequency?</b> Write your prediction <u>before</u> you see the model's answer.</p>
        <div class="form-grid">
          <label>Added mass Δm (g)<input type="number" id="pDm" value="50" step="any"></label>
          <label>Your prediction for the new frequency (Hz)<input type="number" id="pGuess" step="any"></label>
        </div>
        <div class="actions"><button class="primary" id="pSave">🎯 Save my prediction</button></div>
      </div>
      ${state.predictions.length ? `<div class="card"><h3>Results</h3><div class="tbl-wrap"><table class="tbl">
        <tr><th>Δm (g)</th><th>Your guess (Hz)</th><th>Model (Hz)</th><th>Measured (Hz)</th><th>Model error</th><th></th></tr>${rows}</table></div></div>` : ''}`;
    $('#pSave').onclick = () => {
      const dm = parseFloat($('#pDm').value), guess = parseFloat($('#pGuess').value);
      if (!isFinite(dm) || !isFinite(guess)) { toast('Enter Δm and your prediction'); return; }
      const theory = e.predict ? e.predict(r.fn, meff, dm) : defaultPredict(r.fn, meff, dm);
      state.predictions.push({ dm, guess, theory, measured: null });
      renderPredict();
      toast(`The model predicts ${num(theory, 4)} Hz. Now measure to see who is right!`, 5000);
    };
    body.querySelectorAll('[data-measure]').forEach(b => b.onclick = () => { state.pending = +b.dataset.measure; showStep(2); });
  }
  $('#toReport').addEventListener('click', () => showStep(5));

  /* ================= 5. Report ================= */
  const GUIDE = [
    'Was the objective achieved? State the f<sub>n</sub> and ζ you obtained.',
    'How far was your result from theory, and what do you think is the main cause? (See the error analysis in step 3.)',
    'How do you know the system is under-damped?',
    'If you did the prediction test: what did you learn about the relation between mass and frequency?',
    'What would you change to get a more accurate result if you repeated the experiment?'
  ];
  function fillReportForm() {
    const s = store.get('form', {});
    $('#fTitle').value = state.exp.en;
    $('#fBy').value = s.by || ''; $('#fTo').value = s.to || ''; $('#fInst').value = s.inst || ''; $('#fCourse').value = s.course || '';
    if (!$('#fDate').value) $('#fDate').value = new Date().toISOString().slice(0, 10);
    $('#fObj').value = state.exp.objective;
    $('#conclGuide').innerHTML = GUIDE.map(g => `<li>${g}</li>`).join('');
  }
  ['fBy', 'fTo', 'fInst', 'fCourse'].forEach(id => $('#' + id).addEventListener('input', () =>
    store.set('form', { by: $('#fBy').value, to: $('#fTo').value, inst: $('#fInst').value, course: $('#fCourse').value })));

  let lastReport = '';
  $('#buildReport').addEventListener('click', () => {
    const c = ctx();
    c.form = { title: $('#fTitle').value, by: $('#fBy').value, to: $('#fTo').value, institution: $('#fInst').value, course: $('#fCourse').value, date: $('#fDate').value, objective: $('#fObj').value, conclusion: $('#fConcl').value };
    const rows = state.exp.inputs.filter(i => isFinite(state.inputs[i.id])).map(i => `<tr><th>${i.en}</th><td>${state.inputs[i.id]}</td></tr>`).join('');
    c.inputsTable = rows;
    lastReport = Report.build(c);
    $('#reportPreview').innerHTML = lastReport;
    $('#printReport').disabled = $('#dlHtml').disabled = false;
    if (!c.form.conclusion.trim()) toast('Report ready, but you have not written the conclusion yet ✍️', 4500);
    $('#reportPreview').scrollIntoView({ behavior: 'smooth' });
  });
  $('#printReport').addEventListener('click', () => window.print());
  $('#dlHtml').addEventListener('click', async () => {
    let css = '';
    try { css = await (await fetch('style.css')).text(); } catch (e) { }
    download('lab_report.html', `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Lab Report</title><style>${css}</style></head><body class="standalone">${lastReport}</body></html>`, 'text/html');
  });

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ---------- start ---------- */
  renderExperiments();
  window.addEventListener('resize', () => { if ($('#step3').classList.contains('active')) renderAnalysis(); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
})();
