# 〰 PocketLab — Your Pocket Vibrations Lab

**PocketLab turns a smartphone into a mechanical-vibrations lab.** It measures a real vibration, fits a physical model to it, builds a digital twin, compares the result with theory, and writes a complete lab report.

Other simulators show you the theory. PocketLab measures **reality** and compares it with the theory.

🔗 **Live demo:** https://kamalalali157-crypto.github.io/pocketlab/

> Plain HTML + CSS + JavaScript. No frameworks, no build step, no server. It also works offline (PWA).

---

## ✨ Features

| | |
|---|---|
| 📱 **3 sensing modes** | Accelerometer, **non-contact camera tracking** of a colored marker, and microphone (auto-triggered by the strike) |
| 🧠 **Automatic analysis** | Detects the free-vibration region, extracts peaks and fits `x(t) = A·e^(−σt)·cos(ω_d t + φ) + x₀` |
| 📊 **Physical results** | f<sub>n</sub>, ζ (± uncertainty), δ, Q, τ, and k and c when the mass is known |
| 🪞 **Digital twin** | Real motion and the model animated side by side, with mass and damping sliders |
| 🎯 **Predict → test → compare** | The student predicts the effect of an added mass *before* measuring, then compares the prediction, the model and reality |
| 🔍 **Smart error analysis** | Explains *why* results differ from theory, e.g. detects non-viscous damping (air drag vs. Coulomb friction) |
| 📄 **Lab-report generator** | Cover page, Objective, Setup, Procedure, Data & Observations, Analysis & Calculations, Conclusion. Export to PDF |
| ✍️ **Academic integrity** | The conclusion is **written by the student**: PocketLab only provides guiding questions |
| 🧪 **Demo mode** | Synthetic data with known f<sub>n</sub> and ζ, to test the site on a computer |

### Built-in experiments
Cantilever ruler with the phone as tip mass · Spring–mass · Simple pendulum · Tuning fork / glass / string (sound) · Car suspension · Free experiment

---

## 🚀 Getting started

### Run locally
```bash
git clone https://github.com/kamalalali157-crypto/pocketlab.git
cd pocketlab
python -m http.server 8000
```
Open <http://localhost:8000> and choose **🧪 Demo data**. Computers usually have no accelerometer.

### Use it on a phone
Browsers only allow sensors, the camera and the microphone over **HTTPS**. The easiest option is **GitHub Pages**:

1. Repository → **Settings → Pages**
2. Source: **Deploy from a branch**, Branch: `main` / `(root)` → **Save**
3. After about a minute the site is live at `https://kamalalali157-crypto.github.io/pocketlab/`

On iPhone, the site asks for motion-sensor permission. Use **Add to Home Screen** to install it like an app.

---

## 📁 Project structure

```
pocketlab/
├── index.html       UI: the five steps
├── style.css        styling + print layout of the report
├── experiments.js   experiment library and theoretical formulas (add your own here)
├── analysis.js      core: FFT, filtering, free-vibration detection, curve fitting
├── chart.js         lightweight canvas charts
├── sensors.js       accelerometer, camera tracking, microphone, demo data
├── report.js        error analysis + lab-report builder
├── app.js           wires the UI together
├── manifest.json    PWA manifest
├── sw.js            service worker (offline support)
└── icon.svg
```

---

## 🧠 How the analysis works

1. **Resampling:** sensor samples arrive at irregular times, so they are interpolated onto a uniform time base.
2. **Frequency estimate:** FFT of the signal and of its derivative. The derivative ignores the constant offset while the object is held before release. Each candidate is analysed and the best fit wins.
3. **Free-vibration detection:** zero crossings with hysteresis above the noise floor. The region is the longest run of crossings spaced ≈ T/2, starting from the largest amplitude (the release).
4. **Amplitudes:** (peak − trough)/2, which is insensitive to any offset.
5. **Damping:** the slope of ln(A) vs t gives −σ, with its standard error.
6. **Full fit:** Nelder–Mead least squares on the raw waveform.
7. **Physics:** ω<sub>n</sub> = √(ω<sub>d</sub>² + σ²), ζ = σ/ω<sub>n</sub>, δ = σT<sub>d</sub>, Q = 1/2ζ, k = mω<sub>n</sub>², c = 2ζmω<sub>n</sub>.
8. **Damping diagnosis:** σ is compared at large and small amplitudes. Faster decay at large amplitudes points to air drag; faster decay at small amplitudes points to dry (Coulomb) friction.

Tested on synthetic signals: e.g. true f<sub>n</sub> = 1.25 Hz, ζ = 0.02 → measured 1.249 Hz, ζ = 0.0203.

---

## ➕ Adding an experiment
In `experiments.js`, add an object to the `EXPERIMENTS` array, following the existing ones: `inputs` for the measurements, and `theory(v)` returning `{ f, meff, lines }`.

## ⚠️ Limitations
| Mode | Sampling rate | Suitable for |
|---|---|---|
| Accelerometer | 60–100 Hz | up to ~15–20 Hz |
| Camera | 30–60 fps | slow motion (< 5–8 Hz) |
| Microphone | 44–48 kHz | audible frequencies (> 20 Hz) |

- A phone attached to the object adds about 190 g (adjust `PHONE_MASS_G` in `experiments.js`).
- Very heavy damping (fewer than two cycles) cannot be measured reliably. The app reports this instead of returning a wrong value.

## 🛣️ Roadmap
- [ ] Teacher / class mode (class code + aggregated class results), e.g. with Supabase
- [ ] Word (.docx) export
- [ ] Multi-degree-of-freedom systems
