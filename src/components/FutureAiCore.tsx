import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type DragState = { id: number; x: number; y: number; time: number; horizontal: boolean };

export function FutureAiCore() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const angleRef = useRef(0);
  const velocityRef = useRef(0.0018);
  const pulseRef = useRef(0);
  const dragRef = useRef<DragState | null>(null);
  const progressRef = useRef(0);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) {
      setSupported(false);
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lowPower = (navigator.hardwareConcurrency ?? 4) <= 4;
    const particleCount = lowPower ? 12 : 20;
    let visible = true;
    let last = performance.now();

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 1.75);
      canvas.width = Math.max(1, Math.round(box.width * ratio));
      canvas.height = Math.max(1, Math.round(box.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const draw = (now: number) => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const cx = width / 2;
      const cy = height / 2;
      const size = Math.min(width, height);
      const progress = progressRef.current;
      const dt = Math.min(32, now - last);
      last = now;
      if (!reduced && !dragRef.current) {
        angleRef.current += velocityRef.current * dt * (0.65 + progress * 0.5);
        velocityRef.current *= Math.pow(0.995, dt);
        if (Math.abs(velocityRef.current) < 0.0014) velocityRef.current = 0.0014;
      }
      pulseRef.current = Math.max(0, pulseRef.current - dt / 720);
      context.clearRect(0, 0, width, height);
      context.save();
      context.translate(cx, cy);
      context.globalAlpha = 0.32 + progress * 0.68;

      const glow = context.createRadialGradient(0, 0, size * 0.025, 0, 0, size * 0.31);
      glow.addColorStop(0, "rgba(255,255,255,0.98)");
      glow.addColorStop(0.18, "rgba(31,210,255,0.72)");
      glow.addColorStop(0.48, "rgba(0,126,255,0.23)");
      glow.addColorStop(1, "rgba(0,126,255,0)");
      context.fillStyle = glow;
      context.beginPath();
      context.arc(0, 0, size * (0.31 + pulseRef.current * 0.04), 0, Math.PI * 2);
      context.fill();

      const orbitCount = progress < 0.18 ? 1 : progress < 0.46 ? 2 : 3;
      for (let ring = 0; ring < orbitCount; ring += 1) {
        context.save();
        context.rotate(angleRef.current * (ring % 2 ? -0.72 : 1) + ring * 1.05);
        context.scale(1, 0.46 + ring * 0.08);
        context.strokeStyle = ring === 2 ? "rgba(206,160,57,0.68)" : `rgba(0,166,255,${0.48 + ring * 0.12})`;
        context.lineWidth = ring === 0 ? 2 : 1.2;
        context.setLineDash([size * 0.12, size * 0.035]);
        context.beginPath();
        context.arc(0, 0, size * (0.23 + ring * 0.075), 0, Math.PI * 2);
        context.stroke();
        context.restore();
      }
      if (progress > 0.52) {
        for (let index = 0; index < particleCount; index += 1) {
          const phase = (index / particleCount) * Math.PI * 2 + angleRef.current * (index % 2 ? -0.55 : 0.7);
          const radius = size * (0.24 + (index % 4) * 0.044);
          context.fillStyle = index % 7 === 0 ? "rgba(218,171,60,0.9)" : "rgba(66,220,255,0.86)";
          context.beginPath();
          context.arc(Math.cos(phase) * radius, Math.sin(phase) * radius * 0.58, index % 3 === 0 ? 2.1 : 1.35, 0, Math.PI * 2);
          context.fill();
        }
      }
      const core = context.createRadialGradient(-size * 0.035, -size * 0.045, 1, 0, 0, size * 0.115);
      core.addColorStop(0, "#ffffff");
      core.addColorStop(0.24, "#72e7ff");
      core.addColorStop(0.66, "#008cff");
      core.addColorStop(1, "#052753");
      context.fillStyle = core;
      context.shadowColor = "rgba(0,180,255,0.9)";
      context.shadowBlur = size * (0.055 + pulseRef.current * 0.035);
      context.beginPath();
      context.arc(0, 0, size * (0.105 + pulseRef.current * 0.012), 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
      context.strokeStyle = "rgba(255,255,255,0.72)";
      context.lineWidth = 1;
      context.beginPath();
      context.arc(0, 0, size * 0.076, 0, Math.PI * 2);
      context.stroke();
      context.restore();
      if (visible) frameRef.current = requestAnimationFrame(draw);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible && frameRef.current === null) {
        last = performance.now();
        frameRef.current = requestAnimationFrame(draw);
      }
      if (!visible && frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    }, { rootMargin: "160px" });
    observer.observe(canvas);
    const updateProgress = () => {
      const rect = canvas.getBoundingClientRect();
      progressRef.current = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / (window.innerHeight + rect.height * 0.45)));
    };
    resize();
    updateProgress();
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("scroll", updateProgress, { passive: true });
    frameRef.current = requestAnimationFrame(draw);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", updateProgress);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), horizontal: false };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.horizontal && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      drag.horizontal = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (!drag.horizontal) return;
    event.preventDefault();
    const now = performance.now();
    angleRef.current += dx * 0.012;
    velocityRef.current = Math.max(-0.025, Math.min(0.025, dx / Math.max(12, now - drag.time) * 0.014));
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.time = now;
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag && !drag.horizontal) pulseRef.current = 1;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
  };

  return (
    <div className="landing-core-shell" aria-label="Interactive abstract AI core">
      {supported ? (
        <canvas ref={canvasRef} className="landing-core-canvas" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { dragRef.current = null; }} />
      ) : (
        <div className="landing-core-fallback" aria-hidden="true"><span /><span /><span /></div>
      )}
    </div>
  );
}