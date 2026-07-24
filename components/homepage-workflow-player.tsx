"use client";

import { useEffect, useState } from "react";
import { Player } from "@remotion/player";
import {
  PGFlowWorkflowFilm,
  WORKFLOW_FILM_DURATION,
  WORKFLOW_FILM_FPS,
  WORKFLOW_FILM_HEIGHT,
  WORKFLOW_FILM_WIDTH,
} from "./pgflow-workflow-film";

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPrefersReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener("change", sync);
    return () => mediaQuery.removeEventListener("change", sync);
  }, []);

  return prefersReducedMotion;
}

export function HomepageWorkflowPlayer() {
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <div
      className="home-film-player"
      role="group"
      aria-label="PGFlow workflow video showing a resident rent reminder, secure payment link, owner proof review, receipt, and owner workspace"
    >
      <Player
        component={PGFlowWorkflowFilm}
        durationInFrames={WORKFLOW_FILM_DURATION}
        compositionWidth={WORKFLOW_FILM_WIDTH}
        compositionHeight={WORKFLOW_FILM_HEIGHT}
        fps={WORKFLOW_FILM_FPS}
        autoPlay={!prefersReducedMotion}
        loop={!prefersReducedMotion}
        controls
        initiallyMuted
        showVolumeControls={false}
        allowFullscreen
        clickToPlay
        spaceKeyToPlayOrPause
        style={{ width: "100%", aspectRatio: "16 / 9" }}
      />
    </div>
  );
}
