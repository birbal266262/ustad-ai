/**
 * ProfileIdentity — the user's name rendered WITH their equipped cosmetics,
 * plus quick equip controls for the slots that decorate the name.
 *
 * Reads the REAL equipped state from the database (via the cosmetics server
 * functions) and reflects it on the profile: the equipped badge sits next to
 * the displayed name and the equipped name-style is applied to it. The avatar
 * frame is a ring on the picture (handled by ProfileAvatarPanel).
 *
 * Nothing here invents an equipped item — if the slot is empty the name renders
 * with its normal look.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { Check, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useGuest } from "@/lib/ustad-client";
import { cosmeticsStateFn, cosmeticsEquipFn, cosmeticsUnequipFn } from "@/lib/cosmetics.functions";
import { badgeVisualFor, nameStyleVisualFor } from "@/lib/cosmetics-spec";
import type { EquippableCategory } from "@/lib/cosmetics-spec";

type CosmeticsState = Awaited<ReturnType<typeof cosmeticsStateFn>>;
type CosmeticItem = CosmeticsState["categories"]["avatar_frames"]["items"][number];

export function ProfileIdentity() {
  const { token, session } = useGuest();
  const [state, setState] = useState<CosmeticsState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const profileName = (session?.profile?.["name"] as string | undefined)?.trim();
  const stateName = state?.displayName ?? "";
  const displayName = profileName || stateName || "USTAD AI Learner";

  const load = async () => {
    if (!token) return;
    try {
      setState(await cosmeticsStateFn({ data: { token } }));
    } catch {
      setState(null);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!state) {
    return (
      <div className="panel mb-4 flex items-center gap-2 p-5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your profile look…
      </div>
    );
  }

  const badges = state.categories["badges"];
  const nameStyles = state.categories["name_styles"];
  const equippedBadge = badges.items.find((i) => i.equipped) ?? null;
  const equippedNameStyle = nameStyles.items.find((i) => i.equipped) ?? null;
  const equippedFrame = state.categories["avatar_frames"].items.find((i) => i.equipped) ?? null;

  const badgeVisual = equippedBadge ? badgeVisualFor(equippedBadge.assetReference) : null;
  const nameVisual = equippedNameStyle
    ? nameStyleVisualFor(equippedNameStyle.assetReference)
    : null;

  const act = async (
    kind: "equip" | "unequip",
    item: CosmeticItem,
    slotCategory: EquippableCategory,
  ) => {
    if (!token || busy) return;
    setBusy(item.itemId);
    try {
      if (kind === "equip") {
        setState(await cosmeticsEquipFn({ data: { token, itemId: item.itemId } }));
      } else {
        setState(await cosmeticsUnequipFn({ data: { token, category: slotCategory } }));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="panel mb-4 space-y-3 p-5" data-testid="profile-identity">
      <Label>Your profile look</Label>

      {/* The name exactly as it appears, with the equipped badge + name style. */}
      <div className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card/60 px-4 py-3">
        {badgeVisual ? (
          <span
            aria-hidden
            data-testid="equipped-badge-glyph"
            className="inline-flex items-center justify-center text-2xl"
            title={equippedBadge?.name}
          >
            {badgeVisual.glyph}
          </span>
        ) : null}
        <span
          data-testid="equipped-name"
          className="min-w-0 truncate text-lg"
          style={nameVisual ? (nameVisual.style as CSSProperties) : undefined}
        >
          {displayName}
        </span>
      </div>

      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <CosmeticSlot label="Avatar frame" itemName={equippedFrame?.name ?? null} />
        <CosmeticSlot label="Badge" itemName={equippedBadge?.name ?? null} />
        <CosmeticSlot label="Name style" itemName={equippedNameStyle?.name ?? null} />
      </div>

      {/* Equip the badges you own (single active). */}
      {badges.items.filter((i) => i.owned).length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">Your badges</p>
          <div className="flex flex-wrap gap-1.5">
            {badges.items
              .filter((i) => i.owned)
              .map((b) => {
                const v = badgeVisualFor(b.assetReference);
                return b.equipped ? (
                  <Button
                    key={b.itemId}
                    size="sm"
                    variant="secondary"
                    disabled
                    data-testid={`cosmetic-equipped-${b.itemId}`}
                  >
                    {v.glyph} {b.name} ✓
                  </Button>
                ) : (
                  <Button
                    key={b.itemId}
                    size="sm"
                    variant="outline"
                    disabled={busy === b.itemId}
                    data-testid={`cosmetic-equip-${b.itemId}`}
                    onClick={() => act("equip", b, "badges")}
                  >
                    {busy === b.itemId ? (
                      <Loader2 className="mr-1 size-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="mr-1 size-3.5" />
                    )}
                    {v.glyph} {b.name}
                  </Button>
                );
              })}
          </div>
        </div>
      ) : null}

      {/* Equip the name styles you own (single active). */}
      {nameStyles.items.filter((i) => i.owned).length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">Your name styles</p>
          <div className="flex flex-wrap gap-1.5">
            {nameStyles.items
              .filter((i) => i.owned)
              .map((n) => {
                const v = nameStyleVisualFor(n.assetReference);
                return n.equipped ? (
                  <Button
                    key={n.itemId}
                    size="sm"
                    variant="secondary"
                    disabled
                    data-testid={`cosmetic-equipped-${n.itemId}`}
                  >
                    <span style={v.style as CSSProperties}>{displayName}</span> ✓
                  </Button>
                ) : (
                  <Button
                    key={n.itemId}
                    size="sm"
                    variant="outline"
                    disabled={busy === n.itemId}
                    data-testid={`cosmetic-equip-${n.itemId}`}
                    onClick={() => act("equip", n, "name_styles")}
                  >
                    <span style={v.style as CSSProperties}>{n.name}</span>
                  </Button>
                );
              })}
          </div>
        </div>
      ) : null}

      {equippedBadge || equippedNameStyle || equippedFrame ? (
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 self-start"
          onClick={async () => {
            if (equippedBadge) await act("unequip", equippedBadge, "badges");
            if (equippedNameStyle) await act("unequip", equippedNameStyle, "name_styles");
          }}
        >
          <Check className="size-3.5" /> Clear badge &amp; name style
        </Button>
      ) : null}
    </div>
  );
}

function CosmeticSlot({ label, itemName }: { label: string; itemName: string | null }) {
  return (
    <div className="rounded-md bg-surface-2/50 px-2.5 py-1.5">
      <span className="block text-[10px] tracking-wide uppercase opacity-70">{label}</span>
      <span className="block truncate font-medium text-foreground">
        {itemName ?? <span className="font-normal opacity-60">None</span>}
      </span>
    </div>
  );
}
