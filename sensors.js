/* ============================================================
   sensors.js — accelerometer, camera, microphone and demo data
   ============================================================ */
'use strict';

const Sensors = (() => {

  function variance(a) {
    if (!a.length) return 0;
    let m = 0; for (const v of a) m += v; m /= a.length;
    let s = 0; for (const v of a) s += (v - m) ** 2; return s / a.length;
  }

  /* ---------------- accelerometer ---------------- */
  const accel = {
    data: null, handler: null,
    async start() {
      if (!('DeviceMotionEvent' in window)) throw new Error('This device has no accelerometer. Try "Demo data".');
      if (!window.isSecureContext) throw new Error('Sensors only work over https. Deploy the site (see README).');
      if (typeof DeviceMotionEvent.requestPermission === 'function') {   // iPhone
        const r = await DeviceMotionEvent.requestPermission();
        if (r !== 'granted') throw new Error('Motion sensor permission was denied.');
      }
      this.data = { t: [], x: [], y: [], z: [] };
      this.handler = e => {
        let a = e.acceleration;
        if (!a || a.x == null) a = e.accelerationIncludingGravity;
        if (!a || a.x == null) return;
        const d = this.data;
        d.t.push(e.timeStamp / 1000); d.x.push(a.x); d.y.push(a.y); d.z.push(a.z);
      };
      window.addEventListener('devicemotion', this.handler);
    },
    live() {
      const d = this.data; if (!d || d.t.length < 2) return null;
      const k = Math.max(0, d.t.length - 300);
      const ax = ['x', 'y', 'z'].reduce((b, c) => variance(d[c].slice(k)) > variance(d[b].slice(k)) ? c : b, 'z');
      return { t: d.t, y: d[ax], n: d.t.length };
    },
    stop() {
      window.removeEventListener('devicemotion', this.handler);
      const d = this.data;
      if (!d || d.t.length < 20) throw new Error('No data received from the sensor. On a computer, use "Demo data".');
      const axis = ['x', 'y', 'z'].reduce((b, c) => variance(d[c]) > variance(d[b]) ? c : b, 'z');
      return { mode: 'accel', t: d.t, y: d[axis], unit: 'm/s²', quantity: 'Acceleration', meta: { axis } };
    }
  };

  /* ---------------- camera: colored-marker tracking ---------------- */
  const camera = {
    stream: null, video: null, overlay: null, work: null, wctx: null,
    target: null, tol: 60, running: false, recording: false, data: null,
    times: [], fps: 0, onInfo: null,
    async open(video, overlay) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Camera not available (https is required).');
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 60 } }, audio: false
      });
      video.srcObject = this.stream; await video.play();
      this.video = video; this.overlay = overlay;
      const W = 200, H = Math.round(W * (video.videoHeight || 480) / (video.videoWidth || 640));
      this.work = document.createElement('canvas'); this.work.width = W; this.work.height = H;
      this.wctx = this.work.getContext('2d', { willReadFrequently: true });
      overlay.width = W * 3; overlay.height = H * 3;
      this.running = true; this.loop();
    },
    pick(clientX, clientY) {
      const r = this.overlay.getBoundingClientRect();
      const x = Math.round((clientX - r.left) / r.width * this.work.width);
      const y = Math.round((clientY - r.top) / r.height * this.work.height);
      const d = this.wctx.getImageData(Math.max(0, x - 1), Math.max(0, y - 1), 3, 3).data;
      let R = 0, Gc = 0, B = 0; for (let i = 0; i < d.length; i += 4) { R += d[i]; Gc += d[i + 1]; B += d[i + 2]; }
      const k = d.length / 4; this.target = [R / k, Gc / k, B / k];
    },
    loop() {
      const step = (now, meta) => {
        if (!this.running) return;
        const t = meta && meta.captureTime ? meta.captureTime / 1000 : now / 1000;
        this.process(t);
        this.video.requestVideoFrameCallback ? this.video.requestVideoFrameCallback(step) : requestAnimationFrame(n => step(n, null));
      };
      this.video.requestVideoFrameCallback ? this.video.requestVideoFrameCallback(step) : requestAnimationFrame(n => step(n, null));
    },
    process(t) {
      const W = this.work.width, H = this.work.height, S = this.overlay.width / W;
      this.wctx.drawImage(this.video, 0, 0, W, H);
      this.times.push(t); if (this.times.length > 30) this.times.shift();
      if (this.times.length > 5) this.fps = (this.times.length - 1) / (this.times[this.times.length - 1] - this.times[0]);
      const o = this.overlay.getContext('2d'); o.clearRect(0, 0, this.overlay.width, this.overlay.height);
      if (!this.target) { this.onInfo && this.onInfo(`${this.fps.toFixed(0)} fps · tap the marker`); return; }
      const d = this.wctx.getImageData(0, 0, W, H).data, [tr, tg, tb] = this.target, tol2 = this.tol * this.tol;
      let sx = 0, sy = 0, n = 0;
      o.fillStyle = 'rgba(56,189,248,0.35)';
      for (let y = 0, p = 0; y < H; y++) for (let x = 0; x < W; x++, p += 4) {
        const dr = d[p] - tr, dg = d[p + 1] - tg, db = d[p + 2] - tb;
        if (dr * dr + dg * dg + db * db < tol2) { sx += x; sy += y; n++; o.fillRect(x * S, y * S, S, S); }
      }
      if (n < 4) { this.onInfo && this.onInfo(`${this.fps.toFixed(0)} fps · ⚠️ marker lost`); return; }
      const cx = sx / n, cy = sy / n;
      o.strokeStyle = '#f43f5e'; o.lineWidth = 3;
      o.beginPath(); o.arc(cx * S, cy * S, 14, 0, 2 * Math.PI); o.moveTo(cx * S - 22, cy * S); o.lineTo(cx * S + 22, cy * S); o.moveTo(cx * S, cy * S - 22); o.lineTo(cx * S, cy * S + 22); o.stroke();
      if (this.recording) {
        const k = (this.video.videoWidth || 640) / W;
        this.data.t.push(t); this.data.x.push(cx * k); this.data.y.push(-cy * k);
      }
      this.onInfo && this.onInfo(`${this.fps.toFixed(0)} fps · ✅ tracking (${n} px)${this.recording ? ' · ● recording' : ''}`);
    },
    startRec() { this.data = { t: [], x: [], y: [] }; this.recording = true; },
    live() { const d = this.data; if (!d || d.t.length < 2) return null; return { t: d.t, y: variance(d.x) > variance(d.y) ? d.x : d.y, n: d.t.length }; },
    stop(pxPerCm) {
      this.recording = false;
      const d = this.data;
      if (!d || d.t.length < 20) throw new Error('Not enough points were recorded. Make sure the marker is visible and being tracked.');
      const axis = variance(d.x) > variance(d.y) ? 'x' : 'y';
      let y = d[axis], unit = 'px';
      if (pxPerCm > 0) { y = y.map(v => v / pxPerCm); unit = 'cm'; }
      return { mode: 'camera', t: d.t, y, unit, quantity: 'Displacement', meta: { axis: axis === 'x' ? 'horizontal' : 'vertical', fps: this.fps } };
    },
    close() {
      this.running = false; this.recording = false;
      if (this.stream) this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  };

  /* ---------------- microphone: auto-triggered recording ---------------- */
  const mic = {
    ctx: null, stream: null, proc: null, level: 0,
    async start(onArmed, onTrigger, onDone, seconds = 3) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Microphone not available (https is required).');
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC(); await this.ctx.resume();
      const src = this.ctx.createMediaStreamSource(this.stream);
      const proc = this.ctx.createScriptProcessor(4096, 1, 1), mute = this.ctx.createGain(); mute.gain.value = 0;
      src.connect(proc); proc.connect(mute); mute.connect(this.ctx.destination); this.proc = proc;
      const fs = this.ctx.sampleRate, need = Math.round(seconds * fs);
      let calib = [], thr = null, ring = [], rec = null, got = 0;
      proc.onaudioprocess = e => {
        const c = new Float32Array(e.inputBuffer.getChannelData(0));
        let pk = 0, sq = 0; for (const v of c) { pk = Math.max(pk, Math.abs(v)); sq += v * v; }
        this.level = pk;
        if (thr === null) {                       // calibrate background noise for 0.4 s
          calib.push(Math.sqrt(sq / c.length));
          if (calib.length * 4096 >= 0.4 * fs) { thr = Math.max(0.02, 8 * calib.reduce((a, b) => a + b, 0) / calib.length); onArmed && onArmed(); }
          return;
        }
        if (!rec) {
          ring.push(c); if (ring.length > 2) ring.shift();
          if (pk > thr) { rec = ring.slice(); got = rec.reduce((s, a) => s + a.length, 0); onTrigger && onTrigger(); }
          return;
        }
        rec.push(c); got += c.length;
        if (got >= need) {
          proc.onaudioprocess = null;
          const y = new Float32Array(got); let o = 0; for (const a of rec) { y.set(a, o); o += a.length; }
          this.close();
          onDone({ mode: 'mic', uniform: true, fs, y, unit: 'a.u.', quantity: 'Sound pressure (relative)', meta: { threshold: thr } });
        }
      };
    },
    close() {
      try { this.proc && (this.proc.onaudioprocess = null); } catch (e) { }
      if (this.stream) this.stream.getTracks().forEach(t => t.stop());
      if (this.ctx && this.ctx.state !== 'closed') this.ctx.close();
      this.stream = null; this.ctx = null;
    }
  };

  /* ---------------- demo data (to try the site on a computer) ---------------- */
  const demo = {
    generate(fn, zeta, noise) {
      const fs = 100, dur = Math.min(30, Math.max(8, 6 / (zeta * fn + 1e-6) * 0.25 + 4));
      const wn = 2 * Math.PI * fn, wd = wn * Math.sqrt(Math.max(1e-9, 1 - zeta * zeta));
      const g = () => Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(2 * Math.PI * Math.random());
      const t = [], y = []; let tt = 0;
      while (tt < dur) {
        tt += (1 / fs) * (1 + (Math.random() - 0.5) * 0.2);    // irregular timing, like a real sensor
        const tau = tt - 1.5;
        const v = tau < 0 ? 5 + 0.05 * Math.sin(7 * tt) : 5 * Math.exp(-zeta * wn * tau) * Math.cos(wd * tau);
        t.push(tt); y.push(v + noise * 5 * g() + 0.4);
      }
      return { mode: 'demo', t, y, unit: 'cm', quantity: 'Displacement', meta: { fnTrue: fn, zetaTrue: zeta } };
    }
  };

  return { accel, camera, mic, demo };
})();
