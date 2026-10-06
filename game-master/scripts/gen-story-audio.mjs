// ===== 主线剧情的占位音效和开场音乐：在 JS 里合成波形，写成 WAV，再用 ffmpeg 压成 MP3（输出到 src/asset/story/）=====
//   node scripts/gen-story-audio.mjs            全部
//   node scripts/gen-story-audio.mjs slam yay   只生成这几个
// 换成正式的音效 / 曲子：直接覆盖 src/asset/story/ 里同名的 mp3（清单在 src/asset/storyAudio.ts）。
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'asset', 'story');
const SR = 44100;
const ONLY = new Set(process.argv.slice(2));

// 固定种子的随机数：每次生成的一样
let seed = 20261006;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const noise = () => rnd() * 2 - 1;

const buf = sec => new Float32Array(Math.ceil(sec * SR));
const TAU = Math.PI * 2;

/** RBJ 双二阶滤波器（带通 / 低通 / 高通），逐个采样跑 */
function biquad(type, freq, q) {
  let b0, b1, b2, a1, a2, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const set = (f) => {
    const w = TAU * Math.min(f, SR * 0.45) / SR, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
    let n0, n1, n2;
    if (type === 'bp') { n0 = al; n1 = 0; n2 = -al; }
    else if (type === 'lp') { n0 = (1 - cs) / 2; n1 = 1 - cs; n2 = (1 - cs) / 2; }
    else { n0 = (1 + cs) / 2; n1 = -(1 + cs); n2 = (1 + cs) / 2; }
    const a0 = 1 + al;
    b0 = n0 / a0; b1 = n1 / a0; b2 = n2 / a0; a1 = -2 * cs / a0; a2 = (1 - al) / a0;
  };
  set(freq);
  const run = x => { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  run.set = set;
  return run;
}

const saw = ph => 2 * (ph - Math.floor(ph + 0.5));
const square = (ph, duty = 0.5) => ((ph % 1) < duty ? 1 : -1);
const tri = ph => 1 - 4 * Math.abs((ph % 1) - 0.5);

function normalize(a, peak = 0.9) {
  let m = 0; for (const v of a) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < a.length; i++) a[i] *= peak / m;
  return a;
}

function writeMp3(name, data, bitrate = '96k') {
  if (ONLY.size && !ONLY.has(name)) return;
  const dir = mkdtempSync(join(tmpdir(), 'gm-audio-'));
  const wav = join(dir, name + '.wav');
  const pcm = Buffer.alloc(data.length * 2);
  for (let i = 0; i < data.length; i++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, data[i])) * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  writeFileSync(wav, Buffer.concat([h, pcm]));
  mkdirSync(OUT, { recursive: true });
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-ac', '1', '-ar', String(SR), '-b:a', bitrate, join(OUT, name + '.mp3')]);
  rmSync(dir, { recursive: true, force: true });
  console.log('wrote', `story/${name}.mp3`, `${(data.length / SR).toFixed(2)}s`);
}

// ---- 砸下来的一下：低沉的「咚」+ 一点碎响 ----
{
  const a = buf(0.7), lp = biquad('lp', 900, 0.8);
  for (let i = 0; i < a.length; i++) {
    const t = i / SR, f = 48 + 90 * Math.exp(-t * 30);
    a[i] = Math.sin(TAU * f * t) * Math.exp(-t * 7) * 1.1 + lp(noise()) * Math.exp(-t * 22) * 0.9;
  }
  writeMp3('slam', normalize(a));
}

// ---- 呼的一声（扫走标题、拽进庆祝画面）：带通噪声，频率从低滑到高再落 ----
{
  const a = buf(0.45), bp = biquad('bp', 400, 1.2);
  for (let i = 0; i < a.length; i++) {
    const k = i / a.length;
    bp.set(300 + 2200 * Math.sin(Math.PI * k));
    a[i] = bp(noise()) * Math.sin(Math.PI * k) ** 1.5;
  }
  writeMp3('whoosh', normalize(a, 0.8));
}

// ---- 菜单的「嗒」 ----
{
  const a = buf(0.06);
  for (let i = 0; i < a.length; i++) { const t = i / SR; a[i] = (Math.sin(TAU * 1800 * t) * 0.6 + noise() * 0.4) * Math.exp(-t * 90); }
  writeMp3('click', normalize(a, 0.7));
}

// ---- 派对喇叭：嗡嗡的锯齿波，音高往上一挑，带颤音 ----
{
  const a = buf(1.1), lp = biquad('lp', 2600, 0.9);
  let ph = 0, ph2 = 0;
  for (let i = 0; i < a.length; i++) {
    const t = i / SR, f = 330 + 140 * Math.min(1, t / 0.18) + 9 * Math.sin(TAU * 7 * t);
    ph += f / SR; ph2 += f * 1.006 / SR;
    const env = Math.min(1, t / 0.03) * (t > 0.85 ? Math.max(0, 1 - (t - 0.85) / 0.25) : 1);
    a[i] = lp(saw(ph) * 0.6 + square(ph2, 0.3) * 0.35 + noise() * 0.08) * env;
  }
  writeMp3('partyHorn', normalize(a, 0.8));
}

// ---- 礼花：「砰」一下，然后纸屑哗啦啦 ----
{
  const a = buf(1.4), hp = biquad('hp', 2500, 0.7), lp = biquad('lp', 1200, 0.7);
  for (let i = 0; i < a.length; i++) {
    const t = i / SR;
    a[i] = lp(noise()) * Math.exp(-t * 35) * 1.2;
  }
  for (let n = 0; n < 160; n++) {   // 纸屑：一下下细碎的小响
    const at = 0.05 + rnd() * 1.2, len = Math.floor(SR * (0.004 + rnd() * 0.01)), g = 0.25 * (1 - at / 1.4);
    const s0 = Math.floor(at * SR);
    for (let j = 0; j < len && s0 + j < a.length; j++) a[s0 + j] += hp(noise()) * g * (1 - j / len);
  }
  writeMp3('confetti', normalize(a, 0.85));
}

// ---- 开香槟：木塞「啵」+ 气泡嘶嘶 ----
{
  const a = buf(1.6), hp = biquad('hp', 4000, 0.6);
  for (let i = 0; i < a.length; i++) {
    const t = i / SR, f = 300 + 900 * Math.exp(-t * 120);
    const pop = Math.sin(TAU * f * t) * Math.exp(-t * 40) * (t < 0.12 ? 1 : 0);
    const fizz = t > 0.06 ? hp(noise()) * 0.28 * Math.exp(-(t - 0.06) * 2.2) : 0;
    a[i] = pop + fizz;
  }
  writeMp3('cork', normalize(a, 0.85));
}

// ---- 一群小孩喊「耶——」：几个锯齿波人声，音高先扬后落，过两个共振峰（像元音 /e/ → /i/）----
{
  const a = buf(1.7);
  for (let v = 0; v < 6; v++) {
    const f0 = 360 + rnd() * 120, start = rnd() * 0.12, rate = 4.5 + rnd() * 2;
    const f1 = biquad('bp', 650, 5), f2 = biquad('bp', 2300, 7), f3 = biquad('bp', 3000, 8);
    let ph = 0;
    for (let i = Math.floor(start * SR); i < a.length; i++) {
      const t = i / SR - start, k = Math.min(1, t / 1.3);
      const f = f0 * (1 + 0.35 * Math.sin(Math.PI * Math.min(1, t / 0.5)) - 0.15 * k) + 6 * Math.sin(TAU * rate * t);
      ph += f / SR;
      f1.set(700 - 300 * k); f2.set(1900 + 600 * k);
      const env = Math.min(1, t / 0.06) * Math.max(0, 1 - Math.max(0, t - 1.0) / 0.5);
      const src = saw(ph) + noise() * 0.05;
      a[i] += (f1(src) * 1.0 + f2(src) * 0.7 + f3(src) * 0.3) * env * 0.5;
    }
  }
  writeMp3('yay', normalize(a, 0.85));
}

// ---- 罐头掌声：很多下短促的「啪」，先变密再散 ----
{
  const dur = 3.6, a = buf(dur);
  for (let n = 0; n < 260; n++) {
    let at = rnd() * dur;
    const dens = Math.sin(Math.PI * Math.min(1, at / dur)) ** 0.6;   // 中间最密
    if (rnd() > dens) at = rnd() * dur * 0.8 + 0.2;
    const bp = biquad('bp', 900 + rnd() * 1600, 1.4), len = Math.floor(SR * (0.012 + rnd() * 0.02)), g = 0.5 + rnd() * 0.5;
    const s0 = Math.floor(at * SR);
    const fade = at > dur - 0.8 ? Math.max(0, (dur - at) / 0.8) : 1;
    for (let j = 0; j < len && s0 + j < a.length; j++) a[s0 + j] += bp(noise()) * g * fade * Math.exp(-j / len * 5);
  }
  writeMp3('applause', normalize(a, 0.85));
}

// ---- 开场音乐：8 小节循环（Am F C G），方波琶音 + 三角波低音 + 柔和的长音，首尾接得上 ----
{
  const bpm = 112, beat = 60 / bpm, bars = 8, len = bars * 4 * beat;
  const a = buf(len);
  const midi = n => 440 * 2 ** ((n - 69) / 12);
  const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];   // Am F C G
  const add = (t0, dur, f, fn, gain, attack = 0.005, release = 0.08) => {
    const s0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
    let ph = 0;
    for (let j = 0; j < n; j++) {
      const t = j / SR, i = (s0 + j) % a.length;   // 绕回开头：循环接得上
      ph += f / SR;
      const env = Math.min(1, t / attack) * (t > dur - release ? Math.max(0, (dur - t) / release) : 1);
      a[i] += fn(ph) * gain * env;
    }
  };
  const pattern = [0, 1, 2, 1, 2, 0, 1, 2];   // 每小节 8 个八分音符
  for (let b = 0; b < bars; b++) {
    const ch = chords[b % 4], t0 = b * 4 * beat;
    add(t0, 4 * beat, midi(ch[0] - 12), tri, 0.32, 0.01, 0.2);                  // 低音
    for (const n of ch) add(t0, 4 * beat, midi(n), ph => Math.sin(TAU * ph), 0.06, 0.4, 0.6);   // 长音
    pattern.forEach((k, i) => {
      const oct = b >= 4 && i >= 4 ? 24 : 12;
      add(t0 + i * beat / 2, beat * 0.45, midi(ch[k] + oct), ph => square(ph, 0.25), 0.07, 0.003, 0.05);
    });
    if (b % 2 === 1) add(t0 + 3.5 * beat, beat * 0.5, midi(ch[2] + 24), ph => square(ph, 0.5), 0.05);
  }
  // 一点轻轻的拍子（鼓）：每拍一下闭镲，第 1、3 拍一下底鼓
  for (let k = 0; k < bars * 4; k++) {
    const s0 = Math.floor(k * beat * SR), hp = biquad('hp', 7000, 0.7);
    for (let j = 0; j < SR * 0.04; j++) a[(s0 + j) % a.length] += hp(noise()) * 0.05 * Math.exp(-j / SR * 120);
    if (k % 2 === 0) for (let j = 0; j < SR * 0.18; j++) { const t = j / SR; a[(s0 + j) % a.length] += Math.sin(TAU * (50 + 80 * Math.exp(-t * 40)) * t) * 0.35 * Math.exp(-t * 18); }
  }
  writeMp3('openingMusic', normalize(a, 0.8), '128k');
}
