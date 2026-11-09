"use client";

import { useId, useMemo, useState } from "react";

const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function LeakCalculator() {
  const id = useId();
  const [beds, setBeds] = useState(60);
  const [rent, setRent] = useState(8500);
  const [leak, setLeak] = useState(2);

  const result = useMemo(() => {
    const monthlyRent = clamp(beds, 1, 2000) * clamp(rent, 500, 100000);
    const monthlyLeak = monthlyRent * (clamp(leak, 0, 20) / 100);
    return { monthlyRent, monthlyLeak, yearlyLeak: monthlyLeak * 12 };
  }, [beds, rent, leak]);

  return (
    <div className="home-calculator" aria-live="polite">
      <div className="home-calculator-fields">
        <label htmlFor={`${id}-beds`}>
          Beds in your PG
          <input id={`${id}-beds`} type="number" inputMode="numeric" min={1} max={2000} value={beds}
            onChange={(event) => setBeds(Number(event.target.value))} />
        </label>
        <label htmlFor={`${id}-rent`}>
          Average rent per bed (₹)
          <input id={`${id}-rent`} type="number" inputMode="numeric" min={500} max={100000} step={500} value={rent}
            onChange={(event) => setRent(Number(event.target.value))} />
        </label>
        <label htmlFor={`${id}-leak`}>
          Rent that slips through: <strong>{clamp(leak, 0, 20)}%</strong>
          <input id={`${id}-leak`} type="range" min={0} max={10} step={0.5} value={leak}
            onChange={(event) => setLeak(Number(event.target.value))} />
        </label>
      </div>
      <div className="home-calculator-result">
        <span>You collect about {rupees.format(result.monthlyRent)} a month</span>
        <strong>{rupees.format(result.yearlyLeak)}</strong>
        <small>could slip through every year at {clamp(leak, 0, 20)}%. That is {rupees.format(result.monthlyLeak)} a month in late payments never chased, cash never written down, or deposits adjusted twice.</small>
      </div>
    </div>
  );
}
