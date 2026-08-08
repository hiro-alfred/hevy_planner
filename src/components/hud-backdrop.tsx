"use client";

import { useEffect, useRef } from "react";

/**
 * Animated node field behind the whole app.
 *
 * Deliberately cheap: a fixed node count, one pass to draw links and one to
 * draw nodes, no per-frame allocation. It also stops entirely when the tab is
 * hidden, so a backgrounded tab costs nothing.
 *
 * The body already carries a CSS grid background, so if this never mounts (JS
 * off, canvas unsupported) the page still looks intentional rather than blank.
 */

const NODE_COUNT = 44;
const LINK_DISTANCE = 155;
const DRIFT = 0.11;

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function readToken(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value === "" ? fallback : value;
}

export function HudBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const cyan = readToken("--color-hud-cyan", "#22e0ff");
    const magenta = readToken("--color-hud-magenta", "#ff3ecb");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let frame = 0;
    let beam = 0;
    const nodes: Node[] = [];

    // Seeded from the viewport, so nodes start spread out rather than all
    // arriving from one corner.
    function seed() {
      nodes.length = 0;
      for (let i = 0; i < NODE_COUNT; i += 1) {
        nodes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * DRIFT,
          vy: (Math.random() - 0.5) * DRIFT,
        });
      }
    }

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = Math.floor(width * ratio);
      canvas!.height = Math.floor(height * ratio);
      // Draw in CSS pixels regardless of density.
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (nodes.length === 0) seed();
    }

    function draw() {
      context!.clearRect(0, 0, width, height);

      // Links first, so nodes sit on top of the web rather than under it.
      context!.strokeStyle = cyan;
      context!.lineWidth = 1;
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const dx = nodes[i]!.x - nodes[j]!.x;
          const dy = nodes[i]!.y - nodes[j]!.y;
          const distance = Math.hypot(dx, dy);
          if (distance > LINK_DISTANCE) continue;
          context!.globalAlpha = (1 - distance / LINK_DISTANCE) * 0.16;
          context!.beginPath();
          context!.moveTo(nodes[i]!.x, nodes[i]!.y);
          context!.lineTo(nodes[j]!.x, nodes[j]!.y);
          context!.stroke();
        }
      }

      // Square nodes rather than circles — reads as instrumentation, not stars.
      context!.fillStyle = cyan;
      for (const node of nodes) {
        context!.globalAlpha = 0.5;
        context!.fillRect(node.x - 1, node.y - 1, 2, 2);
      }

      // A magenta beam crossing the field on a long cycle: the one element that
      // makes the backdrop feel like a scanning instrument.
      const beamX = (beam % (width + 400)) - 200;
      const gradient = context!.createLinearGradient(beamX - 160, 0, beamX + 160, 0);
      gradient.addColorStop(0, "transparent");
      gradient.addColorStop(0.5, magenta);
      gradient.addColorStop(1, "transparent");
      context!.globalAlpha = 0.07;
      context!.fillStyle = gradient;
      context!.fillRect(beamX - 160, 0, 320, height);

      context!.globalAlpha = 1;
    }

    function step() {
      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        // Wrap instead of bounce: bouncing makes the edges visibly "walled".
        if (node.x < -20) node.x = width + 20;
        if (node.x > width + 20) node.x = -20;
        if (node.y < -20) node.y = height + 20;
        if (node.y > height + 20) node.y = -20;
      }
      beam += 0.9;
      draw();
      frame = window.requestAnimationFrame(step);
    }

    function pauseOrResume() {
      if (document.hidden) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      } else if (frame === 0 && !reduceMotion) {
        frame = window.requestAnimationFrame(step);
      }
    }

    resize();
    window.addEventListener("resize", resize);

    if (reduceMotion) {
      // One static frame: the look survives, the motion does not.
      draw();
    } else {
      document.addEventListener("visibilitychange", pauseOrResume);
      frame = window.requestAnimationFrame(step);
    }

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", pauseOrResume);
    };
  }, []);

  return <canvas ref={canvasRef} className="hud-backdrop" aria-hidden="true" />;
}
