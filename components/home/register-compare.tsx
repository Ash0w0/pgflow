"use client";

import { useId, useState } from "react";
import { MoveHorizontal } from "lucide-react";

const ROWS = [
  { room: "101", name: "Aman", paper: "8500 ✓ 2/11", tidy: "Paid", note: "RCP-0031 · UPI", tone: "paid" },
  { room: "112", name: "Neha", paper: "7500 kal bola", tidy: "Due", note: "Reminder on 5 Nov", tone: "due" },
  { room: "118", name: "Kabir", paper: "9000 ss bheja?", tidy: "Check proof", note: "UTR …4417 waiting", tone: "review" },
  { room: "204", name: "Rohit", paper: "8500 cash → Raju??", tidy: "Paid", note: "Cash by manager · you approved", tone: "paid" },
  { room: "305", name: "Sana", paper: "305 ya 306 ??", tidy: "Due", note: "Not paid yet", tone: "due" },
  { room: "407", name: "Arjun", paper: "6000, 500 baaki", tidy: "Part paid", note: "₹500 left · reminder on", tone: "review" },
] as const;

export function RegisterCompare() {
  const id = useId();
  const [split, setSplit] = useState(56);

  return (
    <section className="ph-register" aria-labelledby="register-title">
      <div className="ph-container ph-register-grid">
        <div className="ph-register-copy">
          <p className="ph-overline">Your register, upgraded</p>
          <h2 id="register-title" className="ph-h2">Same rooms. Same residents. <em>None of the question marks.</em></h2>
          <p className="ph-lead">You don&apos;t have to change how you run your PG. PGFlow keeps the register you already know, and removes the guessing: who paid, how, to whom, and where the receipt is.</p>
          <p className="ph-register-hint"><MoveHorizontal size={16} /> Drag the line to compare</p>
        </div>

        <div className="ph-compare" style={{ ["--split" as string]: `${split}%` }}>
          <div className="ph-paper" aria-hidden="true">
            <div className="ph-paper-head"><span>Rent - Nov</span><span className="ph-paper-scribble">collect by 5th!!</span></div>
            {ROWS.map((row) => (
              <div key={row.room} className="ph-paper-row"><span>{row.room}</span><span>{row.name}</span><span>{row.paper}</span></div>
            ))}
            <span className="ph-coffee" />
          </div>
          <div className="ph-ledger" aria-hidden="true">
            <div className="ph-ledger-head"><span>Room</span><span>Resident</span><span>Status</span></div>
            {ROWS.map((row) => (
              <div key={row.room} className="ph-ledger-row">
                <span className="ph-mono">{row.room}</span>
                <span>{row.name}</span>
                <span><i className={`ph-tag ph-tag-${row.tone}`}>{row.tidy}</i><small>{row.note}</small></span>
              </div>
            ))}
          </div>
          <span className="ph-compare-handle" aria-hidden="true"><MoveHorizontal size={18} /></span>
          <label htmlFor={`${id}-split`} className="ph-sr">Compare the paper register with PGFlow</label>
          <input
            id={`${id}-split`}
            className="ph-compare-range"
            type="range"
            min={8}
            max={92}
            value={split}
            onChange={(event) => setSplit(Number(event.target.value))}
            aria-valuetext={`${split}% paper register`}
          />
        </div>
        <ul className="ph-sr">
          {ROWS.map((row) => <li key={row.room}>Room {row.room}, {row.name}: paper says &ldquo;{row.paper}&rdquo;. PGFlow says {row.tidy}, {row.note}.</li>)}
        </ul>
      </div>
    </section>
  );
}
