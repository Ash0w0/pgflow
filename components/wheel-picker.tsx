"use client";

import { useCallback, useEffect, useId, useRef, type KeyboardEvent } from "react";

export type WheelOption = { key: string; label: string; hint?: string };

const ROW = 44;
const VISIBLE_ROWS = 5;

/**
 * A touch-friendly scroll wheel, like the iOS picker: the option that rests in
 * the highlighted middle row is the selected one. Works with touch, mouse
 * wheel, click and the arrow keys, and is announced as a listbox.
 */
export function WheelPicker({
  options,
  value,
  onChange,
  label,
  disabled = false,
}: {
  options: WheelOption[];
  value: string;
  onChange: (key: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const id = useId();
  const scroller = useRef<HTMLDivElement>(null);
  const settle = useRef<number | null>(null);
  const programmatic = useRef(false);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.key === value));

  const scrollToIndex = useCallback((index: number, smooth: boolean) => {
    const element = scroller.current;
    if (!element) return;
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    programmatic.current = true;
    element.scrollTo({ top: index * ROW, behavior: smooth && !reduce ? "smooth" : "auto" });
    window.setTimeout(() => { programmatic.current = false; }, smooth && !reduce ? 350 : 0);
  }, []);

  // Keep the wheel resting on the selected option (first paint, and when the value changes elsewhere).
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    if (Math.abs(element.scrollTop - selectedIndex * ROW) > 1) scrollToIndex(selectedIndex, false);
  }, [selectedIndex, scrollToIndex, options.length]);

  useEffect(() => () => { if (settle.current) window.clearTimeout(settle.current); }, []);

  function handleScroll() {
    const element = scroller.current;
    if (!element || disabled) return;
    if (settle.current) window.clearTimeout(settle.current);
    // Wait until the wheel stops, then select whatever sits in the middle row.
    settle.current = window.setTimeout(() => {
      if (programmatic.current) return;
      const index = Math.min(options.length - 1, Math.max(0, Math.round(element.scrollTop / ROW)));
      const option = options[index];
      if (option && option.key !== value) onChange(option.key);
    }, 90);
  }

  function select(index: number) {
    const option = options[Math.min(options.length - 1, Math.max(0, index))];
    if (!option || disabled) return;
    if (option.key !== value) onChange(option.key);
    scrollToIndex(options.indexOf(option), true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 3, PageUp: -3 };
    if (event.key in moves) { event.preventDefault(); select(selectedIndex + moves[event.key]); }
    if (event.key === "Home") { event.preventDefault(); select(0); }
    if (event.key === "End") { event.preventDefault(); select(options.length - 1); }
  }

  return (
    <div className={`wheel-picker${disabled ? " is-disabled" : ""}`} style={{ height: ROW * VISIBLE_ROWS }}>
      <div className="wheel-picker-band" aria-hidden="true" style={{ top: ROW * 2, height: ROW }} />
      <div
        ref={scroller}
        className="wheel-picker-scroll"
        role="listbox"
        aria-label={label}
        aria-activedescendant={`${id}-${selectedIndex}`}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        style={{ paddingBlock: ROW * 2 }}
      >
        {options.map((option, index) => (
          <div
            key={option.key}
            id={`${id}-${index}`}
            role="option"
            aria-selected={index === selectedIndex}
            className={`wheel-picker-option${index === selectedIndex ? " is-selected" : ""}`}
            style={{ height: ROW }}
            onClick={() => select(index)}
          >
            <span>{option.label}</span>
            {option.hint && <small>{option.hint}</small>}
          </div>
        ))}
      </div>
    </div>
  );
}
