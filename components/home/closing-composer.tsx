"use client";

import { useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { MessageCircle, SendHorizontal } from "lucide-react";
import { usePrefersReducedMotion } from "./use-reduced-motion";

/** A WhatsApp compose box that types the demo request; pressing send opens the real chat. */
export function ClosingComposer({ href, message }: { href: string; message: string }) {
  const reduce = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [typed, setTyped] = useState(0);
  const text = message.replace(/__/g, "…");
  const shown = reduce ? text.length : typed;

  useEffect(() => {
    if (reduce || !inView || typed >= text.length) return;
    const timer = window.setTimeout(() => setTyped((count) => count + 1), typed === 0 ? 400 : 32);
    return () => window.clearTimeout(timer);
  }, [inView, typed, text.length, reduce]);

  const external = href.startsWith("https://");
  return (
    <div ref={ref} className="ph-composer">
      <div className="ph-composer-head"><span className="ph-avatar">P</span><div><strong>PGFlow</strong><small>Talk to the founder on WhatsApp</small></div></div>
      <div className="ph-composer-body">
        <p aria-hidden="true">{text.slice(0, shown)}<span className={`ph-caret ${shown >= text.length ? "is-done" : ""}`} /></p>
        <span className="ph-sr">Suggested message: {text}</span>
      </div>
      <a className="ph-composer-send" href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        <MessageCircle size={18} /> Book a 15-min demo <SendHorizontal size={17} />
      </a>
    </div>
  );
}
