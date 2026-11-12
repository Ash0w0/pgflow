"use client";

import { useMotionValue, type MotionValue } from "motion/react";
import { useEffect, type RefObject } from "react";

/**
 * 0 when the section's top reaches the top of the viewport, 1 when its bottom
 * reaches the bottom. Computed from window scroll on each animation frame, so
 * sticky children animate in lockstep with the scrollbar.
 */
export function useSectionProgress(ref: RefObject<HTMLElement | null>): MotionValue<number> {
  const progress = useMotionValue(0);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const element = ref.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      const value = travel > 0 ? -rect.top / travel : rect.top <= 0 ? 1 : 0;
      progress.set(Math.min(1, Math.max(0, value)));
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [ref, progress]);

  return progress;
}
