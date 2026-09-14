/**
 * USTAD AI — Equippable profile cosmetics (pure, isomorphic spec).
 *
 * The Shop already has a real, persistent, single-active equip mechanism for
 * `avatar_frames` (profiles.equipped_frame, Part 8). This spec extends that SAME
 * idea to the other categories that decorate the user's displayed name so the
 * rule never drifts between the Shop UI, the profile identity header and the
 * server:
 *
 *   • avatar_frames  → a ring drawn around the avatar picture.
 *   • badges         → a small emblem shown next to the user's name.
 *   • name_styles    → a typographic treatment applied to the user's name.
 *
 * Equip state lives in the database (one column per category on `profiles`), so
 * only ONE item per category can ever be equipped and it survives refresh,
 * logout/login and app restart.
 *
 * The category -> slot mapping is the single source of truth for "single
 * active per category". Nothing here stores or decides ownership; it only
 * declares which categories are equippable and how each equipped item looks.
 */

export const EQUIPPABLE_CATEGORIES = ["avatar_frames", "badges", "name_styles"] as const;

export type EquippableCategory = (typeof EQUIPPABLE_CATEGORIES)[number];

/** Profile column used to persist the equipped item, per equippable category. */
export const EQUIP_COLUMN: Record<EquippableCategory, string> = {
  avatar_frames: "equipped_frame",
  badges: "equipped_badge",
  name_styles: "equipped_name_style",
};

/** Where the equipped cosmetic is surfaced in the profile identity header. */
export const EQUIP_SURFACE: Record<EquippableCategory, string> = {
  avatar_frames: "A ring drawn around your profile picture.",
  badges: "A small emblem shown next to your displayed name.",
  name_styles: "A typographic treatment applied to your displayed name.",
};

export function isEquippableCategory(value: string): value is EquippableCategory {
  return (EQUIPPABLE_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Minimal inline style shape — kept dependency-free (no React import) so this
 * module stays pure and importable from anywhere, client or server. The client
 * renders these keys/values as React inline styles; the server never touches it.
 */
export type InlineStyle = Record<string, string | number>;

/* ------------------------------------------------------------------ */
/* Badge → emblem mapping (driven by asset_reference, never fake)      */
/* ------------------------------------------------------------------ */

export type BadgeVisual = {
  /** Short Unicode glyph used as the badge emblem. */
  glyph: string;
  /** Color-token family for the badge (for tailwind-ish hue classes). */
  hue: string;
  /** Short label shown in the equipped identity header. */
  label: string;
};

export function badgeVisualFor(assetReference: string): BadgeVisual {
  const map: Record<string, BadgeVisual> = {
    "badge/star": { glyph: "⭐", hue: "amber", label: "Learning Star" },
    "badge/quiz": { glyph: "🎯", hue: "sky", label: "Quiz Master" },
    "badge/knowledge": { glyph: "📚", hue: "emerald", label: "Knowledge Pro" },
    "badge/top": { glyph: "🏆", hue: "amber", label: "Top Learner" },
    "badge/champion": { glyph: "👑", hue: "violet", label: "Champion" },
    "badge/legend": { glyph: "🌟", hue: "fuchsia", label: "Legend" },
  };
  const found = map[assetReference];
  if (found) return found;
  return { glyph: badgeGlyphFallback(assetReference), hue: "amber", label: "Badge" };
}

function badgeGlyphFallback(assetReference: string): string {
  const known: Record<string, string> = {
    "badge/learning": "🎓",
    "badge/genius": "🧠",
    "badge/math": "➗",
    "badge/science": "🔬",
    "badge/king": "🤴",
    "badge/queen": "👸",
    "badge/guru": "🧘",
    "badge/pro": "💼",
    "badge/expert": "🔬",
    "badge/elite": "💎",
    "badge/neon": "⚡",
    "badge/epic": "🔥",
    "badge/mythic": "🌀",
    "badge/rare": "✨",
  };
  return known[assetReference] ?? "🏅";
}

/* ------------------------------------------------------------------ */
/* Name style → typographic treatment for the displayed name           */
/* ------------------------------------------------------------------ */

export type NameStyleVisual = {
  /** Inline style applied to the user's displayed name. */
  style: InlineStyle;
  /** Short human label. */
  label: string;
};

export function nameStyleVisualFor(assetReference: string): NameStyleVisual {
  const map: Record<string, NameStyleVisual> = {
    "name/classic": {
      style: { fontFamily: "Georgia, serif", fontWeight: "600" },
      label: "Classic",
    },
    "name/premium": { style: { fontWeight: "700", fontStyle: "italic" }, label: "Premium" },
    "name/gold": {
      style: {
        fontWeight: "800",
        backgroundImage: "linear-gradient(90deg,#b8860b,#f5d76e,#b8860b)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
      },
      label: "Gold",
    },
    "name/diamond": {
      style: {
        fontWeight: "700",
        backgroundImage: "linear-gradient(90deg,#4fc3f7,#e1f5fe,#4fc3f7)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
      },
      label: "Diamond",
    },
    "name/champion": {
      style: { fontWeight: "900", textTransform: "uppercase", letterSpacing: "0.08em" },
      label: "Champion",
    },
    "name/legend": {
      style: {
        fontWeight: "700",
        backgroundImage: "linear-gradient(90deg,#a855f7,#f0abfc,#a855f7)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
      },
      label: "Legend",
    },
  };
  const found = map[assetReference];
  if (found) return found;
  return { style: nameStyleFallback(assetReference), label: "Styled Name" };
}

function nameStyleFallback(assetReference: string): InlineStyle {
  const tokens: Record<string, InlineStyle> = {
    "name/fancy": { fontWeight: "600", fontStyle: "italic" },
    "name/elegant": { fontFamily: "Georgia, serif", fontWeight: "500", letterSpacing: "0.05em" },
    "name/gaming": { fontWeight: "900", textTransform: "uppercase", letterSpacing: "0.04em" },
    "name/neon": {
      color: "#39ff14",
      fontWeight: "700",
      textShadow: "0 0 6px rgba(57,255,20,.6)",
    },
    "name/royal": {
      fontFamily: "Georgia, serif",
      fontWeight: "700",
      color: "#7c3aed",
      textShadow: "0 0 6px rgba(124,58,237,.35)",
    },
    "name/glow": {
      color: "#ffffff",
      fontWeight: "700",
      textShadow: "0 0 8px rgba(59,130,246,.7)",
    },
    "name/bold": { fontWeight: "800" },
    "name/code": { fontFamily: "ui-monospace, monospace", fontWeight: "600" },
  };
  return tokens[assetReference] ?? { fontWeight: "600" };
}
