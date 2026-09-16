/**
 * Luxury glass presentation for the EXISTING Guest ID screen.
 *
 * It renders `children` (the untouched IdentityScreen) inside a glass card that
 * rises out of the suitcase after the cinematic entry. Without the one-shot
 * entry flag it returns the children exactly as before — zero behaviour change.
 */
import { useEffect, useState, type ReactNode } from "react";
import { ENTRY_REVEAL_KEY } from "@/components/entry/CinematicEntry";

export function GlassIdentityStage({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(ENTRY_REVEAL_KEY) === "1") setActive(true);
    } catch {
      /* fall back to the plain screen */
    }
  }, []);

  if (!active) return <>{children}</>;

  return (
    <div className="ce-id-stage">
      <div className="ce-fog" aria-hidden="true" />
      <div className="ce-dust" aria-hidden="true" />
      <div className="ce-id-case" aria-hidden="true">
        <span className="ce-case-glow" style={{ opacity: 0.9 }} />
        <span className="ce-case-shell" />
      </div>
      <div className="ce-id-wrap">
        <div className="ce-id-card">
          <div className="ce-id-inner">{children}</div>
        </div>
      </div>
      <div className="ce-vignette" aria-hidden="true" />
    </div>
  );
}
