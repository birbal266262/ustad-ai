/**
 * NEW USTAD AI — the futuristic visual mode of the SAME app.
 *
 * This route adds no backend, no second identity and no business logic: it uses
 * the existing guest session (useGuest), the existing identity gate
 * (IdentityScreen) and links to the EXISTING routes for every feature.
 */
import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Sparkles,
  MessageSquare,
  GraduationCap,
  ClipboardList,
  Trophy,
  Swords,
  Search,
  Crown,
  CalendarClock,
  ShoppingCart,
  NotebookPen,
  Brain,
  BellRing,
  Boxes,
  Settings as SettingsIcon,
  Home,
  ArrowLeft,
} from "lucide-react";
import { useGuest, shortId } from "@/lib/ustad-client";
import { IdentityScreen } from "@/components/IdentityScreen";
import { GlassIdentityStage } from "@/components/entry/GlassIdentityStage";
import { UstadLogo } from "@/components/UstadLogo";
import { NotificationCenter } from "@/components/NotificationCenter";
import { FutureAiCore } from "@/components/FutureAiCore";
import { setNextMode } from "@/lib/next-mode";
import {
  GlassPanel,
  SectionReveal,
  FuturisticCard,
  FuturisticButton,
  type NextFeature,
} from "@/components/next/NextUi";

export const Route = createFileRoute("/next")({
  head: () => ({
    meta: [
      { title: "NEW USTAD AI — Futuristic Learning Interface" },
      {
        name: "description",
        content:
          "The next-generation USTAD AI experience: a premium futuristic interface over the same AI tutor, coins, shop, events, tournaments and achievements.",
      },
      { property: "og:title", content: "NEW USTAD AI — Futuristic Mode" },
      {
        property: "og:description",
        content:
          "A premium futuristic interface for USTAD AI — same account, same data, next-generation experience.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NextUstadPage,
});

const FEATURES: NextFeature[] = [
  { to: "/app", title: "USTAD AI", text: "Ask anything — your personal ustad answers.", icon: MessageSquare, motif: "ai" },
  { to: "/study", title: "Study", text: "Chapters, lessons and guided practice.", icon: GraduationCap, motif: "ai" },
  { to: "/classroom", title: "Classroom", text: "Live 2D classroom with voice teaching.", icon: Boxes, motif: "ai" },
  { to: "/exams", title: "Exams", text: "Generated papers with real scoring.", icon: ClipboardList, motif: "medal" },
  { to: "/crorepati", title: "Crorepati", text: "The premium quiz-show challenge.", icon: Trophy, motif: "medal" },
  { to: "/mega", title: "Mega Tournament", text: "Large-scale competitive rounds.", icon: Swords, motif: "versus" },
  { to: "/tournament", title: "Mystery Tournament", text: "Surprise formats, real rewards.", icon: Search, motif: "versus" },
  { to: "/god-tournament", title: "God Master", text: "The hardest tier of competition.", icon: Crown, motif: "versus" },
  { to: "/events", title: "Events", text: "Live event schedule and status.", icon: CalendarClock, motif: "event" },
  { to: "/shop", title: "USTAD Shop", text: "Spend Ustad Coins on real items.", icon: ShoppingCart, motif: "coin" },
  { to: "/notes", title: "Notes", text: "Smart notes saved to your account.", icon: NotebookPen, motif: "ai" },
  { to: "/memory", title: "Memory", text: "What USTAD remembers about you.", icon: Brain, motif: "ai" },
  { to: "/reminders", title: "Reminders", text: "Study reminders and alerts.", icon: BellRing, motif: "pulse" },
  { to: "/settings", title: "Settings", text: "Keys, profile, preferences, data.", icon: SettingsIcon, motif: "ai" },
];

const NAV = [
  { to: "/next", label: "Home", icon: Home },
  { to: "/app", label: "AI", icon: MessageSquare },
  { to: "/shop", label: "Shop", icon: ShoppingCart },
  { to: "/events", label: "Events", icon: CalendarClock },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

function NextUstadPage() {
  const { session, status, ready, username, guestId } = useGuest();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    setNextMode(true);
    const onScroll = () => setCompact(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Same identity gate as the rest of the app — never a second session.
  if (!ready || !session) {
    if (status === "idle" || status === "initializing" || status === "recovering") {
      return (
        <div className="nx-root flex items-center justify-center" role="status" aria-live="polite">
          <span className="nx-mark size-14 animate-pulse">
            <UstadLogo className="size-9" priority />
          </span>
        </div>
      );
    }
    return (
      <GlassIdentityStage>
        <IdentityScreen />
      </GlassIdentityStage>
    );
  }

  const displayName = username || (guestId ? shortId(guestId) : "Learner");

  return (
    <div className="nx-root">
      <div className="nx-grid" aria-hidden="true" />

      <GlassPanel as="header" className={`nx-header ${compact ? "is-compact" : ""}`}>
        <Link to="/next" className="nx-wordmark" aria-label="NEW USTAD AI home">
          <span className="nx-mark">
            <UstadLogo className="size-5" priority />
          </span>
          USTAD AI
        </Link>
        <div className="nx-header-actions">
          <NotificationCenter />
          <Link to="/settings" className="nx-chip">
            <SettingsIcon className="size-4" /> Settings
          </Link>
        </div>
      </GlassPanel>

      <main className="nx-main">
        <SectionReveal>
          <GlassPanel className="nx-welcome">
            <p className="nx-eyebrow">Welcome back</p>
            <h1 className="nx-h1">{displayName}</h1>
            <p className="nx-sub">Ready to learn something new?</p>
          </GlassPanel>
        </SectionReveal>

        <SectionReveal delay={60}>
          <GlassPanel className="nx-ai-card">
            <p className="nx-eyebrow">Intelligence core</p>
            <div className="nx-core-wrap">
              <FutureAiCore />
            </div>
            <div className="grid w-full gap-2">
              <FuturisticButton to="/app" variant="solid">
                <Sparkles className="size-5" /> Ask USTAD AI
              </FuturisticButton>
              <FuturisticButton to="/classroom" variant="ghost">
                <Boxes className="size-5" /> Enter Classroom
              </FuturisticButton>
            </div>
          </GlassPanel>
        </SectionReveal>

        <SectionReveal delay={40}>
          <dl className="nx-stat-row">
            <GlassPanel className="nx-stat">
              <dt>Guest ID</dt>
              <dd>{shortId(guestId)}</dd>
            </GlassPanel>
            <GlassPanel className="nx-stat">
              <dt>Mode</dt>
              <dd>New USTAD AI</dd>
            </GlassPanel>
          </dl>
        </SectionReveal>

        <SectionReveal delay={40}>
          <div className="flex flex-col gap-3">
            <h2 className="nx-h2">Your systems</h2>
            <div className="nx-grid-cards">
              {FEATURES.map((feature) => (
                <FuturisticCard key={feature.to} feature={feature} />
              ))}
            </div>
          </div>
        </SectionReveal>

        <SectionReveal delay={40}>
          <GlassPanel className="nx-footer">
            <Link to="/app" className="nx-chip" onClick={() => setNextMode(false)}>
              <ArrowLeft className="size-4" /> Back to classic USTAD AI
            </Link>
            <p className="mt-3">Developer by Yusuf Ali</p>
          </GlassPanel>
        </SectionReveal>
      </main>

      <GlassPanel as="footer" className="nx-nav">
        <nav aria-label="New USTAD AI navigation" className="flex w-full gap-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`nx-nav-item ${active ? "is-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </GlassPanel>
    </div>
  );
}
