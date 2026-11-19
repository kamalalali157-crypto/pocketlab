/* ============================================================
   experiments.js — experiment library + number formatting helpers
   ============================================================ */
'use strict';

const PHONE_MASS_G = 190;   // typical smartphone mass (adjust for your device)
const G = 9.81;

/* Format a number as HTML (scientific notation when needed) */
function fmt(x, d = 4) {
  if (x == null || !isFinite(x)) return '—';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e5 || a < 1e-3) {
    const [m, e] = x.toExponential(d - 1).split('e');
    return `${m}×10<sup>${+e}</sup>`;
  }
  return String(+x.toPrecision(d));
}
/* Plain-text formatting (for charts and UI) */
function num(x, d = 3) {
  if (x == null || !isFinite(x)) return '—';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e5 || a < 1e-3) return x.toExponential(d - 1);
  return String(+x.toPrecision(d));
}

const MODE_NAMES = { accel: '📱 Accelerometer', camera: '🎥 Camera', mic: '🎤 Sound', demo: '🧪 Demo' };
const MODE_EN = {
  accel: 'smartphone accelerometer (DeviceMotion API)',
  camera: 'non-contact video tracking of a colored marker (smartphone camera)',
  mic: 'smartphone microphone (acoustic recording)',
  demo: 'synthetic demonstration data'
};

/* Default prediction when a mass Δm is added:  f ∝ 1/√m */
function defaultPredict(fMeas, meff, dmGrams) {
  if (!meff) return null;
  return fMeas * Math.sqrt(meff / (meff + dmGrams / 1000));
}

const EXPERIMENTS = [
  {
    id: 'cantilever', icon: '📏', mode: 'accel',
    title: 'Cantilever ruler with the phone at its tip',
    en: 'Free Vibration of a Cantilever Beam with a Tip Mass',
    desc: 'Clamp a long ruler to the edge of a table and tape the phone to its free end. The phone\'s mass becomes part of the experiment (a tip mass) instead of a source of error.',
    objective: 'To determine experimentally the natural frequency and the damping ratio of a cantilever beam carrying a tip mass (the smartphone itself) using the phone\'s built-in accelerometer, and to compare the measured natural frequency with the value predicted by Euler–Bernoulli beam theory.',
    equipment: ['Long ruler (steel, aluminium or wood), 40–60 cm', 'Table edge and C-clamp (or heavy books)', 'Smartphone running PocketLab (accelerometer mode)', 'Adhesive tape', 'Measuring tape, vernier caliper and digital scale'],
    setup: [
      'Clamp the ruler firmly to the table edge, leaving a free length of 30–50 cm.',
      'Tape the phone securely to the free end, screen facing up.',
      'Measure the free length L, width b and thickness h; weigh the ruler and the phone.',
      'Press "Start recording", pull the free end down about 3 cm and release it.',
      'Wait until the vibration has almost stopped, then press "Stop".'
    ],
    setupEn: [
      'The ruler was clamped rigidly to the edge of a table, leaving a free (overhanging) length L.',
      'The smartphone was taped securely to the free end of the ruler, screen facing up, to act as both tip mass and sensor.',
      'The free length L, width b and thickness h of the ruler were measured, and the masses of the ruler and phone were weighed.',
      'Recording was started, the free end was displaced by approximately 3 cm and released from rest.',
      'The free vibration was recorded until the motion had almost completely decayed, then recording was stopped.'
    ],
    inputs: [
      { id: 'L', label: 'Free length L (cm)', en: 'Free length L (cm)', def: 40 },
      { id: 'b', label: 'Ruler width b (cm)', en: 'Width b (cm)', def: 3 },
      { id: 'h', label: 'Ruler thickness h (mm)', en: 'Thickness h (mm)', def: 1 },
      { id: 'E', label: 'Young\'s modulus E (GPa): steel 200, aluminium 69, wood 10', en: 'Young\'s modulus E (GPa)', def: 200 },
      { id: 'mb', label: 'Mass of the free part of the ruler (g)', en: 'Mass of free part of ruler m_b (g)', def: 50 },
      { id: 'M', label: 'Tip mass = phone + any extra (g)', en: 'Tip mass M (g)', def: PHONE_MASS_G }
    ],
    theory(v) {
      if (![v.L, v.b, v.h, v.E, v.mb, v.M].every(isFinite)) return null;
      const L = v.L / 100, b = v.b / 100, h = v.h / 1000, E = v.E * 1e9;
      const I = b * h ** 3 / 12, k = 3 * E * I / L ** 3;
      const meff = v.M / 1000 + 0.2357 * v.mb / 1000;
      const f = Math.sqrt(k / meff) / (2 * Math.PI);
      return {
        f, meff, kTheory: k, lines: [
          `I = b·h³/12 = ${fmt(b)} × (${fmt(h)})³ / 12 = ${fmt(I)} m⁴`,
          `k = 3EI/L³ = 3 × ${fmt(E)} × ${fmt(I)} / (${fmt(L)})³ = ${fmt(k)} N/m`,
          `m<sub>eff</sub> = M + 0.2357·m<sub>b</sub> = ${fmt(v.M / 1000)} + 0.2357 × ${fmt(v.mb / 1000)} = ${fmt(meff)} kg`,
          `f<sub>n,theory</sub> = (1/2π)·√(k/m<sub>eff</sub>) = (1/2π)·√(${fmt(k)}/${fmt(meff)}) = <b>${fmt(f)} Hz</b>`
        ]
      };
    }
  },
  {
    id: 'spring', icon: '🌀', mode: 'camera',
    title: 'Spring–mass system', en: 'Free Vibration of a Spring–Mass System',
    desc: 'Hang a mass on a spring and film it with the camera. The phone never touches the system, so it adds no extra mass.',
    objective: 'To measure the natural frequency and damping ratio of a vertical spring–mass system using non-contact video tracking, to determine the spring stiffness and damping coefficient, and to compare the measured frequency with theory including the effective mass of the spring.',
    equipment: ['Helical spring and slotted mass set', 'Retort stand and clamp', 'Colored sticker attached to the mass (tracking marker)', 'Smartphone on a fixed stand running PocketLab (camera mode)', 'Digital scale'],
    setup: [
      'Hang the spring from the stand and attach the mass to its end.',
      'Stick a brightly colored sticker (red or green) on the mass.',
      'Fix the phone 50–100 cm away so the mass stays fully visible during its motion. The camera must face the mass squarely.',
      'Turn on the camera and tap the sticker to select its color.',
      'Pull the mass 2–3 cm down, release it, then press "Start recording".',
      'Record for 10–20 seconds, then stop.'
    ],
    setupEn: [
      'The spring was suspended from a retort stand and the mass was attached to its free end.',
      'A brightly colored sticker was fixed to the mass to serve as a tracking marker.',
      'The smartphone was fixed on a stand 0.5–1 m away with its camera axis perpendicular to the plane of motion.',
      'The marker color was selected on screen to initialise the tracking algorithm.',
      'The mass was displaced 2–3 cm downward and released from rest; recording was then started.',
      'The motion was recorded for 10–20 s and the recording was stopped.'
    ],
    inputs: [
      { id: 'm', label: 'Suspended mass m (g)', en: 'Suspended mass m (g)', def: 200 },
      { id: 'ms', label: 'Spring mass (g)', en: 'Spring mass m_s (g)', def: 20 },
      { id: 'k', label: 'Spring constant k (N/m), optional', en: 'Spring constant k (N/m)', def: '' }
    ],
    theory(v) {
      if (!isFinite(v.m)) return null;
      const ms = isFinite(v.ms) ? v.ms : 0;
      const meff = (v.m + ms / 3) / 1000;
      const lines = [`m<sub>eff</sub> = m + m<sub>s</sub>/3 = ${fmt(v.m / 1000)} + ${fmt(ms / 1000)}/3 = ${fmt(meff)} kg`];
      if (!isFinite(v.k)) return { f: null, meff, lines };
      const f = Math.sqrt(v.k / meff) / (2 * Math.PI);
      lines.push(`f<sub>n,theory</sub> = (1/2π)·√(k/m<sub>eff</sub>) = (1/2π)·√(${fmt(v.k)}/${fmt(meff)}) = <b>${fmt(f)} Hz</b>`);
      return { f, meff, kTheory: v.k, lines };
    }
  },
  {
    id: 'pendulum', icon: '🕰️', mode: 'camera',
    title: 'Simple pendulum', en: 'Simple Pendulum: Frequency and Damping',
    desc: 'Film the pendulum bob with the camera. The analysis extracts the frequency and damping from the bob\'s motion.',
    objective: 'To measure the oscillation frequency and damping ratio of a simple pendulum using video tracking, and to compare the measured frequency with the small-angle theoretical value f = (1/2π)√(g/L).',
    equipment: ['String and pendulum bob', 'Retort stand and clamp', 'Colored sticker on the bob', 'Smartphone on a fixed stand running PocketLab (camera mode)', 'Measuring tape'],
    setup: [
      'Hang the bob from the string. Measure L from the pivot to the centre of the bob.',
      'Stick a colored marker on the bob.',
      'Fix the phone facing the pendulum squarely and select the marker color.',
      'Pull the bob aside by a small angle (less than 10°), release it, and record for 20–30 seconds.'
    ],
    setupEn: [
      'The bob was suspended by a light string; the length L was measured from the pivot to the centre of the bob.',
      'A colored marker was attached to the bob.',
      'The smartphone was fixed facing the plane of oscillation and the marker color was selected.',
      'The bob was released from a small angle (< 10°) and the motion was recorded for 20–30 s.'
    ],
    inputs: [
      { id: 'L', label: 'Pendulum length L (cm)', en: 'Pendulum length L (cm)', def: 60 },
      { id: 'm', label: 'Bob mass (g)', en: 'Bob mass (g)', def: 100 }
    ],
    theory(v) {
      if (!isFinite(v.L)) return null;
      const L = v.L / 100, f = Math.sqrt(G / L) / (2 * Math.PI);
      return { f, meff: null, lines: [`f<sub>theory</sub> = (1/2π)·√(g/L) = (1/2π)·√(${G}/${fmt(L)}) = <b>${fmt(f)} Hz</b>`] };
    },
    predict(fMeas) { return fMeas; }   // mass does not affect a pendulum's frequency!
  },
  {
    id: 'sound', icon: '🔔', mode: 'mic',
    title: 'Tuning fork, glass or string', en: 'Natural Frequency and Damping from Acoustic Decay',
    desc: 'Strike the object and the microphone records its sound. The natural frequency and the damping (how fast the sound fades) are extracted from the recording.',
    objective: 'To determine the natural frequency and damping ratio of a lightly damped vibrating object (tuning fork, glass or string) from the decay of its acoustic emission recorded with a smartphone microphone.',
    equipment: ['Tuning fork / glass / guitar string', 'Rubber mallet or pencil', 'Smartphone running PocketLab (microphone mode)', 'Quiet room'],
    setup: [
      'Place the phone 10–20 cm from the object in a quiet room.',
      'Press "Start recording" and wait until it says "Ready".',
      'Strike the object once. Recording starts automatically and lasts 3 seconds.'
    ],
    setupEn: [
      'The smartphone was placed 10–20 cm from the object in a quiet room.',
      'The recorder was armed; it calibrated the background noise level automatically.',
      'The object was struck once; recording was triggered automatically by the sound and lasted 3 s.'
    ],
    inputs: [{ id: 'f0', label: 'Nominal frequency (Hz), e.g. the value stamped on the fork', en: 'Nominal frequency (Hz)', def: '' }],
    theory(v) {
      return isFinite(v.f0) ? { f: v.f0, meff: null, lines: [`f<sub>nominal</sub> = <b>${fmt(v.f0)} Hz</b> (value stamped on the object)`] } : null;
    },
    noPredict: true
  },
  {
    id: 'car', icon: '🚗', mode: 'accel',
    title: 'Car suspension', en: 'In-situ Measurement of a Car Suspension Response',
    desc: 'Place the phone flat on the car floor (not in your hand). With the car parked, push one corner down and let go.',
    objective: 'To estimate the natural frequency and damping ratio of a passenger-car suspension from its free response to a vertical disturbance, measured with a smartphone accelerometer, and to compare the results with typical design values.',
    equipment: ['Passenger car (parked, engine off)', 'Smartphone running PocketLab (accelerometer mode), placed flat on the floor above the tested wheel'],
    setup: [
      'Park the car on level ground with the engine off.',
      'Place the phone flat on the floor above the wheel you are testing.',
      'Press "Start recording", push the corner of the car down firmly and release it suddenly.',
      'Wait 3 seconds, then stop.'
    ],
    setupEn: [
      'The car was parked on level ground with the engine off.',
      'The smartphone was placed flat on the floor above the tested wheel.',
      'The corner of the car was pushed down firmly and released suddenly.',
      'The response was recorded for approximately 3 s after release.'
    ],
    inputs: [],
    theory() { return null; },
    typical: { f: [1, 1.5], zeta: [0.2, 0.4] },
    noPredict: true
  },
  {
    id: 'free', icon: '🧪', mode: 'accel',
    title: 'Free experiment', en: 'Free Vibration Measurement',
    desc: 'Measure anything that vibrates: a washing machine, a footbridge, a table...',
    objective: 'To measure the natural frequency and damping ratio of a vibrating system from its free-decay response using smartphone sensors.',
    equipment: ['Vibrating system under test', 'Smartphone running PocketLab'],
    setup: ['Prepare the experiment and choose a suitable measurement mode.', 'Disturb the object and let it vibrate freely.', 'Record until the vibration has mostly died out.'],
    setupEn: ['The system under test was prepared and an appropriate sensing mode was selected.', 'The system was disturbed and allowed to vibrate freely.', 'The free response was recorded until it had largely decayed.'],
    inputs: [
      { id: 'm', label: 'Effective mass (g), optional, to compute k and c', en: 'Effective mass (g)', def: '' },
      { id: 'ft', label: 'Theoretical frequency (Hz), optional', en: 'Theoretical frequency (Hz)', def: '' }
    ],
    theory(v) {
      const meff = isFinite(v.m) ? v.m / 1000 : null;
      if (!isFinite(v.ft)) return meff ? { f: null, meff, lines: [] } : null;
      return { f: v.ft, meff, lines: [`f<sub>theory</sub> = <b>${fmt(v.ft)} Hz</b> (given)`] };
    }
  }
];

if (typeof module !== 'undefined') module.exports = { EXPERIMENTS, fmt, num, defaultPredict };
