"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { isReducedMotionNow, subscribePreferences } from "./preferences";

export interface ParticlesCanvasProps {
  className?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

const MAX_PARTICLES = 40;
/** One particle per this many square pixels, capped at MAX_PARTICLES. */
const AREA_PER_PARTICLE = 16_000;
const LINK_DISTANCE = 120;
/** px per frame at 60fps. */
const MAX_SPEED = 0.22;

function readColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * Auth-page ambience: at most 40 slow particles linked by faint lines (a quiet
 * nod to neural networks), in the accent and violet tokens of the current
 * theme. Stops and clears with reduced motion, pauses while the tab is hidden,
 * and redraws crisply on resize and DPR changes. Decorative (aria-hidden).
 */
export function ParticlesCanvas({ className }: ParticlesCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    let particles: Particle[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let running = false;
    let dotColor = readColor("--accent", "#0066cc");
    let linkColor = readColor("--accent-2", "#6e56cf");

    const seed = () => {
      const count = Math.min(MAX_PARTICLES, Math.max(8, Math.round((width * height) / AREA_PER_PARTICLE)));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 2 * MAX_SPEED,
        vy: (Math.random() - 0.5) * 2 * MAX_SPEED,
        r: 1 + Math.random() * 1.2,
      }));
    };

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, box.width);
      height = Math.max(1, box.height);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (particles.length === 0) seed();
      else {
        // Keep the existing particles, folded back inside the new bounds.
        particles.forEach((p) => {
          p.x = Math.min(p.x, width);
          p.y = Math.min(p.y, height);
        });
      }
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distance = Math.hypot(dx, dy);
          if (distance < LINK_DISTANCE) {
            context.globalAlpha = (1 - distance / LINK_DISTANCE) * 0.28;
            context.strokeStyle = linkColor;
            context.lineWidth = 1;
            context.beginPath();
            context.moveTo(a.x, a.y);
            context.lineTo(b.x, b.y);
            context.stroke();
          }
        }
      }
      context.fillStyle = dotColor;
      for (const p of particles) {
        context.globalAlpha = 0.55;
        context.beginPath();
        context.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
    };

    const step = () => {
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;
        p.x = Math.max(0, Math.min(width, p.x));
        p.y = Math.max(0, Math.min(height, p.y));
      }
      draw();
      frame = window.requestAnimationFrame(step);
    };

    const stop = () => {
      running = false;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    };

    const sync = () => {
      const shouldRun = !isReducedMotionNow() && !document.hidden;
      if (isReducedMotionNow()) {
        stop();
        context.clearRect(0, 0, width, height);
        return;
      }
      if (shouldRun && !running) {
        running = true;
        frame = window.requestAnimationFrame(step);
      } else if (!shouldRun && running) {
        stop();
      }
    };

    const onThemeChange = () => {
      dotColor = readColor("--accent", dotColor);
      linkColor = readColor("--accent-2", linkColor);
      if (!running && !isReducedMotionNow()) draw();
    };

    resize();
    sync();

    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (!running && !isReducedMotionNow()) draw();
    });
    resizeObserver.observe(canvas);
    const themeObserver = new MutationObserver(onThemeChange);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const unsubscribe = subscribePreferences(sync);
    document.addEventListener("visibilitychange", sync);

    return () => {
      stop();
      resizeObserver.disconnect();
      themeObserver.disconnect();
      unsubscribe();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 size-full", className)}
    />
  );
}
