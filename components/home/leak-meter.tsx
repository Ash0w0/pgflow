"use client";

import { animate, useInView } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./use-reduced-motion";

const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function clamp(value: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.min(Math.max(value, min), max) : min;
}

function CountUp({ value }: { value: number }) {
  const reduce = usePrefersReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const previous = useRef(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduce || !inView) {
      node.textContent = rupees.format(value);
      previous.current = value;
      return;
    }
    const controls = animate(previous.current, value, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => { node.textContent = rupees.format(Math.round(latest)); },
    });
    previous.current = value;
    return () => controls.stop();
  }, [value, inView, reduce]);

  return <span ref={ref}>{rupees.format(value)}</span>;
}

export function LeakMeter() {
  const id = useId();
  const [beds, setBeds] = useState(40);
  const [rent, setRent] = useState(8500);
  const [leak, setLeak] = useState(2);

  const result = useMemo(() => {
    const monthlyRent = clamp(beds, 1, 500) * clamp(rent, 2000, 40000);
    const monthlyLeak = monthlyRent * (clamp(leak, 0, 10) / 100);
    return { monthlyRent, monthlyLeak, yearlyLeak: monthlyLeak * 12 };
  }, [beds, rent, leak]);

  return (
    <section className="ph-leak" aria-labelledby="leak-title">
      <div className="ph-container ph-leak-grid">
        <div>
          <p className="ph-overline">The quiet cost</p>
          <h2 id="leak-title" className="ph-h2">Rent rarely disappears at once. <em>It leaks.</em></h2>
          <p className="ph-lead">A reminder not sent. Cash that was never written down. A deposit adjusted twice. Move the sliders to see what a small leak means over a year for a PG like yours.</p>
        </div>
        <div className="ph-leak-card" aria-live="polite">
          <div className="ph-slider">
            <label htmlFor={`${id}-beds`}><span>Beds</span><b>{beds}</b></label>
            <input id={`${id}-beds`} type="range" min={5} max={300} step={5} value={beds} onChange={(event) => setBeds(Number(event.target.value))} />
          </div>
          <div className="ph-slider">
            <label htmlFor={`${id}-rent`}><span>Average rent per bed</span><b>{rupees.format(rent)}</b></label>
            <input id={`${id}-rent`} type="range" min={3000} max={25000} step={500} value={rent} onChange={(event) => setRent(Number(event.target.value))} />
          </div>
          <div className="ph-slider">
            <label htmlFor={`${id}-leak`}><span>Rent that slips through</span><b>{leak}%</b></label>
            <input id={`${id}-leak`} type="range" min={0.5} max={10} step={0.5} value={leak} onChange={(event) => setLeak(Number(event.target.value))} />
          </div>
          <div className="ph-leak-result">
            <small>Could slip through in a year</small>
            <strong><CountUp value={result.yearlyLeak} /></strong>
            <p>That is {rupees.format(result.monthlyLeak)} a month out of {rupees.format(result.monthlyRent)} in rent. An estimate from your own numbers, not a promise.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
