"use client";

import { useEffect, useRef, useState } from "react";

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.12;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.stop(ctx.currentTime + 0.36);
    osc.onended = () => void ctx.close();
  } catch {
    /* ignore */
  }
}

export function TurnAlert({ active }: { active: boolean }) {
  const [show, setShow] = useState(false);
  const prev = useRef(false);

  useEffect(() => {
    if (active && !prev.current) {
      setShow(true);
      navigator.vibrate?.([180, 70, 180, 70, 320]);
      beep();
      const hide = window.setTimeout(() => setShow(false), 2200);
      prev.current = true;
      return () => window.clearTimeout(hide);
    }
    if (!active) prev.current = false;
  }, [active]);

  if (!show) return null;
  return (
    <button
      className="fixed inset-0 z-50 grid place-items-center bg-gold/90 px-6"
      onClick={() => setShow(false)}
    >
      <div className="text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-felt-deep/70">Mesa</p>
        <p className="font-display mt-2 text-6xl leading-none text-felt-deep">Sua vez</p>
        <p className="mt-4 text-sm text-felt-deep/70">Toque para apostar</p>
      </div>
    </button>
  );
}
