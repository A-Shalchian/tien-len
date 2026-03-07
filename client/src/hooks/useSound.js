import { useState, useCallback, useRef, useEffect } from 'react';

const SOUNDS = {
  click: { freq: 800, duration: 0.05, type: 'sine', gain: 0.15 },
  play: { freq: 200, duration: 0.12, type: 'square', gain: 0.15, sweep: 400 },
  pass: { freq: 600, duration: 0.2, type: 'sine', gain: 0.1, sweep: -400 },
  turn: { freq: 520, duration: 0.15, type: 'sine', gain: 0.15, second: { freq: 780, delay: 0.12 } },
  win: { freq: 523, duration: 0.12, type: 'sine', gain: 0.2, notes: [659, 784, 1047] },
  lose: { freq: 400, duration: 0.2, type: 'sine', gain: 0.15, sweep: -200 },
  emote: { freq: 1000, duration: 0.08, type: 'sine', gain: 0.1 },
};

function playTone(ctx, { freq, duration, type, gain, sweep, second, notes }, startTime) {
  const osc = ctx.createOscillator();
  const vol = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  if (sweep) {
    osc.frequency.linearRampToValueAtTime(freq + sweep, startTime + duration);
  }
  vol.gain.setValueAtTime(gain, startTime);
  vol.gain.linearRampToValueAtTime(0, startTime + duration);
  osc.connect(vol);
  vol.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.01);

  if (second) {
    playTone(ctx, { freq: second.freq, duration, type, gain }, startTime + second.delay);
  }

  if (notes) {
    notes.forEach((noteFreq, i) => {
      playTone(ctx, { freq: noteFreq, duration, type, gain }, startTime + (i + 1) * 0.14);
    });
  }
}

export function useSound() {
  const [muted, setMuted] = useState(() => {
    try { return localStorage.getItem('tl-muted') === 'true'; } catch { return false; }
  });
  const ctxRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem('tl-muted', muted); } catch {}
  }, [muted]);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  const playSound = useCallback((name) => {
    if (muted) return;
    const sound = SOUNDS[name];
    if (!sound) return;
    try {
      const ctx = getCtx();
      playTone(ctx, sound, ctx.currentTime);
    } catch {}
  }, [muted, getCtx]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => !prev);
  }, []);

  return { playSound, muted, toggleMute };
}
