// 音频：全部程序化生成。音效带短回声；背景音乐白天轻快（C–G–Am–F），夜里 chiptune（Am–F–C–G），关键节点时变慢变闷并叠心跳。
import { G } from './状态.js';

let AC = null, BUS = null;
export function ac() {
  if (!AC) {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    BUS = AC.createGain(); BUS.gain.value = G.vSfx; BUS.connect(AC.destination);
    const dl = AC.createDelay(), fb = AC.createGain(), wet = AC.createGain(); dl.delayTime.value = .11; fb.gain.value = .25; wet.gain.value = .22;
    BUS.connect(dl); dl.connect(fb).connect(dl); dl.connect(wet).connect(AC.destination);
    MUS.gain = AC.createGain(); MUS.gain.gain.value = 0; MUS.lp = AC.createBiquadFilter(); MUS.lp.type = 'lowpass'; MUS.lp.frequency.value = 9000;
    MUS.gain.connect(MUS.lp).connect(AC.destination); MUS.next = AC.currentTime + .1;
  }
  if (AC.state === 'suspended') AC.resume(); return AC;
}
export function beep(f, d = .03, type = 'square', vol = .05, f2 = null, delay = 0) {
  if (G.muted || !G.started) return; const a = ac(), t = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + d); o.connect(g).connect(BUS); o.start(t); o.stop(t + d + .02);
}
export function noise(d = .15, vol = .06, hp = 800, delay = 0, lp = 0) {
  if (G.muted || !G.started) return; const a = ac(), n = Math.floor(a.sampleRate * d), b = a.createBuffer(1, n, a.sampleRate), ch = b.getChannelData(0);
  for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); s.buffer = b; f.type = lp ? 'lowpass' : 'highpass'; f.frequency.value = lp || hp; g.gain.value = vol;
  s.connect(f).connect(g).connect(BUS); s.start(a.currentTime + delay);
}
// 音效。夜间那一组的名字剧本积木里会用到（「播放音效」积木），不要改名
export const SFX = {
  // —— 夜间 ——
  tick: sp => beep(900 + Math.min(1, sp) * 900, .016, 'square', .035),
  type: () => beep(520 + Math.random() * 260, .012, 'square', .012),
  key: () => { noise(.02, .03, 2500); beep(1800 + Math.random() * 400, .01, 'triangle', .008); },
  chunk: () => { noise(.03, .035, 0, 0, 1800); beep(240, .03, 'square', .02, 520); },
  land: () => beep(1100 + Math.random() * 300, .025, 'triangle', .016),
  pop: i => beep(380 + i * 90, .08, 'square', .04, 760 + i * 120),
  blip: () => beep(1600, .012, 'triangle', .02),
  click: () => { beep(900, .02, 'square', .03); beep(1400, .03, 'triangle', .02, null, .02); },
  windup: () => beep(300, .16, 'sawtooth', .04, 140),
  launch: () => { noise(.25, .06, 0, 0, 3000); beep(200, .2, 'square', .03, 900); },
  hit: () => { noise(.06, .08, 0, 0, 6000); [784, 988, 1175].forEach((f, i) => beep(f, .14, 'square', .04, null, i * .04)); },
  erase: () => { noise(.22, .1, 1200); beep(600, .14, 'square', .04, 90); },
  zap: () => beep(1400, .08, 'square', .03, 500),
  flick: () => { noise(.12, .08, 600); beep(260, .16, 'sawtooth', .05, 1400); },
  confirm: () => [523, 659, 784, 1046, 1318].forEach((f, i) => beep(f, .09, 'square', .04, null, i * .045)),
  slam: () => { noise(.15, .1, 0, 0, 900); beep(110, .25, 'square', .06, 55); },
  good: () => [659, 784, 988, 1318].forEach((f, i) => beep(f, .12, 'square', .045, null, i * .07)),
  bad: () => [392, 349, 311].forEach((f, i) => beep(f, .16, 'square', .04, null, i * .1)),
  thumbUp: () => { beep(1046, .06, 'square', .05); beep(1568, .18, 'square', .04, null, .06); noise(.08, .05, 4000); },
  thumbDown: () => { beep(180, .2, 'square', .06, 90); noise(.1, .07, 0, 0, 800); },
  damage: () => { beep(150, .32, 'sawtooth', .08, 45); noise(.2, .08, 0, 0, 700); },
  send: () => beep(700, .07, 'triangle', .04, 1400),
  note: () => beep(880, .06, 'sine', .04),
  slow: () => { noise(.6, .07, 0, 0, 1500); beep(500, .7, 'sine', .07, 60); },
  resume: () => { noise(.35, .05, 0, 0, 2500); beep(80, .4, 'sine', .07, 600); },
  charge: i => beep(400 + i * 80, .05, 'square', .035),
  ultra: () => { [784, 988, 1175, 1568].forEach((f, i) => beep(f, .1, 'square', .035, null, i * .05)); noise(.3, .04, 5000); },
  heart: () => { beep(300, .24, 'square', .06, 70); noise(.12, .06, 500); },
  // —— 白天 ——
  hover: () => beep(1200, .01, 'triangle', .014),
  page: () => noise(.05, .03, 0, 0, 2600),
  word: () => { beep(700 + Math.random() * 900, .02, 'triangle', .016); if (Math.random() < .3) noise(.02, .02, 3000); },
  select: () => { noise(.06, .08, 0, 0, 6000); [784, 988, 1175].forEach((f, i) => beep(f, .12, 'square', .04, null, i * .04)); },
  unlock: () => { noise(.1, .09, 0, 0, 6000); [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => beep(f, .14, 'square', .05, null, i * .06)); beep(2093, .4, 'triangle', .04, null, .38); },
  levelup: () => { [392, 523, 659, 784].forEach((f, i) => beep(f, .1, 'square', .045, null, i * .07)); [1046, 1318].forEach((f, i) => beep(f, .35, 'triangle', .05, null, .3 + i * .05)); noise(.4, .05, 5000, .3); },
  pick: () => { beep(1046, .06, 'square', .06); beep(1568, .18, 'square', .05, null, .06); noise(.08, .07, 4000); beep(90, .2, 'square', .05, 45); },
  toss: () => { noise(.3, .06, 0, 0, 1200); beep(500, .35, 'sawtooth', .03, 80); },
  grow: () => [659, 784, 988, 1318].forEach((f, i) => beep(f, .1, 'triangle', .045, null, i * .05)),
  shrink: () => [392, 330, 262].forEach((f, i) => beep(f, .1, 'triangle', .035, null, i * .05)),
  step: i => beep(900 + i * 120, .04, 'square', .03),
  shuffle: () => { for (let i = 0; i < 5; i++) beep(600 + i * 140, .03, 'square', .025, null, i * .03); noise(.15, .05, 2000); },
  munch: () => { noise(.05, .07, 0, 0, 1400); beep(160 + Math.random() * 80, .05, 'square', .035, 90); },
  heartIn: () => { [784, 1046, 1318, 1568].forEach((f, i) => beep(f, .12, 'square', .05, null, i * .07)); noise(.12, .05, 5000, .25); },
  thud: () => { beep(140, .18, 'square', .06, 60); noise(.08, .06, 0, 0, 900); },
  stretch: () => { beep(300, .5, 'triangle', .05, 700); beep(500, .4, 'sine', .03, 250, .5); },
  wipe: () => { noise(.9, .05, 0, 0, 1200); beep(600, .9, 'sine', .05, 90); },
  morning: () => [523, 659, 784, 1046].forEach((f, i) => beep(f, .18, 'triangle', .05, null, i * .12)),
  // 大肥鱼白天说话：每个字一声短促的「哔」，音高在五声音阶里跳，像动森
  voice: () => { const n = [0, 2, 4, 7, 9, 12][Math.random() * 6 | 0]; beep(660 * Math.pow(2, n / 12), .045, 'square', .028); beep(1320 * Math.pow(2, n / 12), .03, 'triangle', .012); },
};
export function setSfxVolume(v) { if (BUS) BUS.gain.value = v; }

// ---------- 背景音乐 ----------
const MUS = { gain: null, lp: null, step: 0, next: 0 };
const NIGHT = { ch: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], bpm: 96 };
const DAY = { ch: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], bpm: 112 };
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function mnote(m, t, d, type, vol) {
  const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = mtof(m);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + d); o.connect(g).connect(MUS.gain); o.start(t); o.stop(t + d + .05);
}
function mhat(t) {
  const n = AC.sampleRate * .03 | 0, b = AC.createBuffer(1, n, AC.sampleRate), c = b.getChannelData(0); for (let i = 0; i < n; i++) c[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(); s.buffer = b; f.type = 'highpass'; f.frequency.value = 7000; g.gain.value = .5; s.connect(f).connect(g).connect(MUS.gain); s.start(t);
}
function mthump(t) {
  if (G.muted) return; const o = AC.createOscillator(), g = AC.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(38, t + .18);
  g.gain.setValueAtTime(.35 * G.vSfx, t); g.gain.exponentialRampToValueAtTime(.0001, t + .22); o.connect(g).connect(AC.destination); o.start(t); o.stop(t + .25);
}
export function musUpdate() {
  if (!AC || !MUS.gain) return;
  const night = G.mode === 'night', S_ = night ? NIGHT : DAY, slow = night && G.musSlow, spb = 60 / S_.bpm / 4 * (slow ? 2.2 : 1);
  MUS.lp.frequency.setTargetAtTime(slow ? 650 : 9000, AC.currentTime, .15);
  MUS.gain.gain.setTargetAtTime(G.muted || G.over ? 0 : (night ? .075 : .065) * G.vMusic, AC.currentTime, .2);
  BUS.gain.setTargetAtTime(G.vSfx * 1.1, AC.currentTime, .05);
  while (MUS.next < AC.currentTime + .15) {
    const s = MUS.step % 64, ch = S_.ch[Math.floor(s / 16)], i = s % 16, t = MUS.next;
    if (night) {
      if (i % 8 === 0) mnote(ch[0] - 24, t, spb * 7, 'triangle', .9);
      if (i % 8 === 4) mnote(ch[0] - 12, t, spb * 3, 'triangle', .5);
      const arp = [0, 1, 2, 1, 2, 0, 1, 2];
      if (!slow) { mnote(ch[arp[i % 8]] + 12, t, spb * .9, 'square', .22); if (i % 4 === 2) mhat(t); if (i === 0 || i === 10) mnote(ch[2] + 24, t, spb * 2, 'triangle', .18); }
      else if (i % 2 === 0) mnote(ch[arp[i % 8]] + 12, t, spb * 1.6, 'triangle', .28);
      if (slow && i % 4 === 0) { mthump(t); mthump(t + .16); }
    } else {
      if (i % 4 === 0) mnote(ch[0] - 24, t, spb * 3, 'triangle', .8);
      const mel = [2, 1, 0, 1, 2, 2, 1, 0];
      if (i % 2 === 0) mnote(ch[mel[(i / 2) % 8]] + 12, t, spb * 1.6, 'square', .16);
      if (i === 6 || i === 14) mnote(ch[2] + 24, t, spb * 1.2, 'triangle', .14);
      if (G.musHype) { mnote(ch[i % 3] + 24, t, spb * .8, 'square', .08); if (i % 2 === 1) mhat(t); } else if (i % 4 === 2) mhat(t);
    }
    MUS.step++; MUS.next += spb;
  }
}
