/**
 * NEW USTAD AI — presentational design-system primitives.
 *
 * These components are PURELY visual. They own no state, no data fetching and
 * no business logic: every screen built with them keeps using the existing
 * session (useGuest), the existing routes and the existing backend.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";

export function GlassPanel({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "header" | "footer";
}) {
  return <Tag className={`nx-glass ${className}`}>{children}</Tag>;
}

/** Reveals children once when they scroll into view (IntersectionObserver). */
export function SectionReveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.14 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`nx-reveal ${shown ? "is-in" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export type NextFeature = {
  to: string;
  title: string;
  text: string;
  icon: React.ComponentType<{ className?: string }>;
  motif?: "ai" | "coin" | "shop" | "event" | "versus" | "medal" | "pulse";
};

/** A single futuristic feature card that links to an EXISTING route. */
export function FuturisticCard({ feature }: { feature: NextFeature }) {
  const Icon = feature.icon;
  return (
    <Link to={feature.to} className={`nx-card nx-motif-${feature.motif ?? "ai"}`}>
      <span className="nx-card-sweep" aria-hidden="true" />
      <span className="nx-card-icon" aria-hidden="true">
        <Icon className="size-5" />
      </span>
      <span className="nx-card-body">
        <span className="nx-card-title">{feature.title}</span>
        <span className="nx-card-text">{feature.text}</span>
      </span>
      <span className="nx-card-dot" aria-hidden="true" />
    </Link>
  );
}

export function FuturisticButton({
  children,
  onClick,
  to,
  variant = "solid",
  className = "",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  to?: string;
  variant?: "solid" | "ghost";
  className?: string;
  type?: "button" | "submit";
}) {
  const cls = `nx-btn nx-btn-${variant} ${className}`;
  if (to) {
    return (
      <Link to={to} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} className={cls} onClick={onClick}>
      {children}
    </button>
  );
}
