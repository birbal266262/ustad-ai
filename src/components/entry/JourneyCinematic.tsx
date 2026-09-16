/**
 * USTAD AI — post-verification cinematic journey.
 *
 * Plays ONCE, on top of the already-rendered existing app, after the EXISTING
 * Guest ID / Backup ID verification has succeeded. It is purely visual:
 * no authentication, no session, no data access of any kind happens here.
 * Only the username is ever passed in — never the password.
 *
 * Everything is CSS transforms/opacity (2.5D), so there is no asset to load
 * and nothing that can fail; a hard safety timeout always ends the overlay.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const JOURNEY_FLAG_KEY = "ustad.journey.pending";
export const JOURNEY_NAME_KEY = "ustad.journey.username";

type Phase =
  | "verify"
  | "load"
  | "drive"
  | "arrive"
  | "transfer"
  | "takeoff"
  | "fly"
  | "land"
  | "dissolve";

const MAX_LETTERS = 10;
const HARD_TIMEOUT_MS = 45_000;

type Flying = { key: string; char: string; dx: number; dy: number; kind: "drop" | "board" };

export function JourneyCinematic({
  username,
  onFinish,
}: {
  username: string;
  onFinish: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("verify");
  const [ending, setEnding] = useState(false);
  const [flying, setFlying] = useState<Flying[]>([]);
  const [loaded, setLoaded] = useState<string[]>([]);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const cargoRef = useRef<HTMLDivElement | null>(null);
  const planeRef = useRef<HTMLDivElement | null>(null);
  const timers = useRef<number[]>([]);
  const done = useRef(false);

  const letters = useMemo(() => {
    const clean = (username || "USTAD").replace(/\s+/g, "").toUpperCase().slice(0, MAX_LETTERS);
    return clean.length > 0 ? clean.split("") : ["U", "S", "T", "A", "D"];
  }, [username]);

  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    setEnding(true);
    window.setTimeout(onFinish, 700);
  }, [onFinish]);

  const after = useCallback((ms: number, fn: () => void) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  }, []);

  useEffect(() => {
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      after(1400, finish);
      return () => {
        timers.current.forEach((id) => window.clearTimeout(id));
        timers.current = [];
      };
    }

    // Safety net: whatever happens, the user always reaches the app.
    after(HARD_TIMEOUT_MS, finish);

    const target = (el: HTMLElement | null, yOffset: number) => {
      const stage = stageRef.current;
      if (!stage || !el) return { dx: 0, dy: 160 };
      const s = stage.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return {
        dx: r.left + r.width / 2 - (s.left + s.width / 2),
        dy: r.top + r.height / 2 - (s.top + s.height * 0.2) + yOffset,
      };
    };

    const step = 520;
    const loadDuration = 900 + letters.length * step + 500;

    // 1) verification overlay
    after(2300, () => {
      setPhase("load");

      // 2) letters fall into the cargo, one at a time
      letters.forEach((char, i) => {
        after(900 + i * step, () => {
          const { dx, dy } = target(cargoRef.current, 0);
          setFlying((f) => [...f, { key: `d${i}`, char, dx, dy, kind: "drop" }]);
          after(760, () => {
            setFlying((f) => f.filter((x) => x.key !== `d${i}`));
            setLoaded((l) => [...l, char]);
          });
        });
      });
    });

    // 3) journey
    after(2300 + loadDuration, () => setPhase("drive"));
    after(2300 + loadDuration + 5600, () => setPhase("arrive"));

    const transferAt = 2300 + loadDuration + 5600 + 2600;
    after(transferAt, () => {
      setPhase("transfer");
      letters.forEach((char, i) => {
        after(300 + i * 240, () => {
          setLoaded((l) => l.slice(1));
          const { dx, dy } = target(planeRef.current, -10);
          const from = target(cargoRef.current, 0);
          setFlying((f) => [
            ...f,
            { key: `b${i}`, char, dx: dx - from.dx, dy: dy - from.dy, kind: "board" },
          ]);
          after(900, () => setFlying((f) => f.filter((x) => x.key !== `b${i}`)));
        });
      });
    });

    const transferDuration = 300 + letters.length * 240 + 900;
    after(transferAt + transferDuration, () => setPhase("takeoff"));
    after(transferAt + transferDuration + 2600, () => setPhase("fly"));
    after(transferAt + transferDuration + 2600 + 5200, () => setPhase("land"));
    after(transferAt + transferDuration + 2600 + 5200 + 2400, () => setPhase("dissolve"));
    after(transferAt + transferDuration + 2600 + 5200 + 2400 + 1300, finish);

    return () => {
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current = [];
    };
  }, [after, finish, letters]);

  // The board letters travel from the cargo, so they start at the cargo spot.
  const cargoOrigin = phase === "transfer";

  return (
    <div
      ref={stageRef}
      className={`jc-stage${ending ? " is-ending" : ""}`}
      data-phase={phase}
      role="presentation"
      aria-hidden="true"
    >
      <div className="jc-world">
        <div className="jc-sky" />
        <div className="jc-stars" />
        <div className="jc-far" />
        <div className="jc-ground" />
        <div className="jc-mid" />
        <div className="jc-road" />

        {/* ---- truck ---- */}
        <div className="jc-truck">
          <div className="jc-truck-body">
            <div className="jc-cargo" ref={cargoRef}>
              <div className="jc-cargo-fill">
                {loaded.map((char, i) => (
                  <span
                    key={`c${i}${char}`}
                    className="jc-cargo-letter"
                    style={{ left: `${6 + (i % 5) * 17}px`, bottom: `${2 + Math.floor(i / 5) * 18}px` }}
                  >
                    {char}
                  </span>
                ))}
              </div>
            </div>
            <div className="jc-cab">
              <span className="jc-head" />
            </div>
            <span className="jc-brake" />
            <span className="jc-wheel w1" />
            <span className="jc-wheel w2" />
            <span className="jc-wheel w3" />
          </div>
        </div>

        {/* ---- airplane ---- */}
        <div className="jc-plane" ref={planeRef}>
          <span className="jc-tail" />
          <span className="jc-wing" />
          <span className="jc-fuse" />
          <span className="jc-nose-win" />
          <span className="jc-plane-door" />
          <span className="jc-gear g1" />
          <span className="jc-gear g2" />
        </div>

        {/* ---- 2D character ---- */}
        <div className="jc-char">
          <span className="jc-char-head" />
          <span className="jc-char-body" />
          <span className="jc-char-leg l1" />
          <span className="jc-char-leg l2" />
        </div>

        {/* ---- username letters in flight ---- */}
        {flying.map((f) => (
          <span
            key={f.key}
            className={`jc-letter ${f.kind}`}
            style={
              {
                left: "50%",
                top: cargoOrigin && f.kind === "board" ? undefined : "18%",
                bottom: f.kind === "board" ? "36%" : undefined,
                "--jc-dx": `${f.dx}px`,
                "--jc-dy": `${f.dy}px`,
              } as React.CSSProperties
            }
          >
            {f.char}
          </span>
        ))}

        <div className="jc-mist" />
      </div>

      {phase === "verify" ? (
        <div className="jc-verify">
          <div className="jc-ring">
            <span className="jc-tick">✓</span>
          </div>
          <div className="jc-verify-title">Verified</div>
          <div className="jc-verify-sub">Guest ID verified successfully</div>
          <div className="jc-sweep" />
        </div>
      ) : null}

      <div className="jc-vignette" />

      <button type="button" className="jc-skip" onClick={finish}>
        Skip
      </button>
    </div>
  );
}
