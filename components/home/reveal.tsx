"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { usePrefersReducedMotion } from "./use-reduced-motion";

/** Gently brings a block into view once; static when motion is reduced. */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = usePrefersReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Draws the founder's handwritten signature when it scrolls into view. */
export function Signature({ name }: { name: string }) {
  const reduce = usePrefersReducedMotion();
  return (
    <svg className="ph-signature" viewBox="0 0 320 90" role="img" aria-label={`Signed, ${name}`}>
      <motion.text
        x="6"
        y="62"
        initial={reduce ? false : { strokeDashoffset: 900, fillOpacity: 0 }}
        whileInView={{ strokeDashoffset: 0, fillOpacity: 1 }}
        viewport={{ once: true, amount: 0.8 }}
        transition={{ strokeDashoffset: { duration: 2.2, ease: "easeInOut" }, fillOpacity: { delay: 1.6, duration: 0.8 } }}
        style={{ strokeDasharray: 900 }}
      >
        {name}
      </motion.text>
      <motion.path
        d="M8 76 C 90 70, 190 82, 300 68"
        initial={reduce ? false : { pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true, amount: 0.8 }}
        transition={{ delay: 1.8, duration: 0.8, ease: "easeOut" }}
      />
    </svg>
  );
}
