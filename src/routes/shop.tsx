/**
 * 🛒 USTAD SHOP — spend USTAD Coins on cosmetics and customization (Part 7).
 *
 * The client is a renderer. It shows the server's catalogue, the server's
 * prices and the server's balance, and asks the server to buy an item BY ID.
 * It never sends a price or a balance, and it never decides whether a purchase
 * succeeded — after every attempt it re-reads the authoritative wallet.
 *
 * USTAD Coins are virtual in-app coins. Not money, not rupees, not dollars.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Coins, Loader2, Lock, ShoppingCart, Check, Wand2, Ban } from "lucide-react";
import { toast } from "sonner";

import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useGuest } from "@/lib/ustad-client";
import { shopFn, shopBuyFn } from "@/lib/wallet.functions";
import { tournamentTicketsFn, buyGodTicketFn } from "@/lib/tournament.functions";
import { GOD_TICKET, formatIndianCoins } from "@/lib/tournament-spec";
import { useCosmetics } from "@/lib/useCosmetics";
import { isEquippableCategory, badgeVisualFor, nameStyleVisualFor } from "@/lib/cosmetics-spec";
import { cosmeticsEquipFn, cosmeticsUnequipFn } from "@/lib/cosmetics.functions";
import { CoinOfferBanner } from "@/components/CoinOfferBanner";

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "USTAD Shop — Spend USTAD Coins | USTAD AI" },
      {
        name: "description",
        content:
          "Spend the USTAD Coins you win in quizzes and tournaments on avatar frames, profile themes, name styles, classroom and board themes, and profile customization unlocks.",
      },
      { property: "og:title", content: "USTAD Shop — USTAD AI" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ShopPage,
});

type ShopView = Awaited<ReturnType<typeof shopFn>>;
type Item = ShopView["categories"][number]["items"][number];

/** Small visual preview for an equippable cosmetic card. */
function CosmeticPreview({ item, equipped }: { item: Item; equipped: boolean }) {
  if (item.category === "badges") {
    const v = badgeVisualFor(item.assetReference);
    return (
      <span className="my-2 inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-sm">
        <span aria-hidden>{v.glyph}</span>
        <span className="text-xs font-medium">{v.label}</span>
      </span>
    );
  }
  if (item.category === "name_styles") {
    const v = nameStyleVisualFor(item.assetReference);
    return (
      <span
        className="my-2 inline-flex items-center rounded-md bg-muted/60 px-2.5 py-1 text-sm font-semibold"
        style={v.style}
      >
        Name Style
      </span>
    );
  }
  if (item.category === "avatar_frames") {
    return (
      <span className="my-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="inline-block size-3 rounded-full ring-2 ring-amber-400" aria-hidden />
        Avatar frame
        {equipped ? " · equipped" : ""}
      </span>
    );
  }
  return null;
}

function ItemCard({
  item,
  balance,
  busy,
  onBuy,
  equipped,
  equipping,
  onEquip,
  onUnequip,
}: {
  item: Item;
  balance: number;
  busy: boolean;
  onBuy: (item: Item) => void;
  /** true when this specific item is the currently equipped one in its slot. */
  equipped: boolean;
  /** true while a cosmetics equip/unequip request is in flight for this card. */
  equipping: boolean;
  onEquip: (item: Item) => void;
  onUnequip: (item: Item) => void;
}) {
  const affordable = balance >= item.price;
  const equippable = isEquippableCategory(item.category);

  let action: ReactNode;
  if (!item.owned) {
    action = (
      <Button
        size="sm"
        data-testid={`shop-buy-${item.itemId}`}
        disabled={busy || !affordable}
        onClick={() => onBuy(item)}
        className="gap-1.5"
        title={affordable ? `Buy ${item.name}` : "Not enough USTAD Coins"}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : affordable ? (
          <ShoppingCart className="size-4" aria-hidden />
        ) : (
          <Lock className="size-4" aria-hidden />
        )}
        {affordable ? "Buy" : "Locked"}
      </Button>
    );
  } else if (equippable) {
    action = equipped ? (
      <Button
        size="sm"
        variant="secondary"
        disabled={equipping}
        data-testid={`shop-unequip-${item.itemId}`}
        onClick={() => onUnequip(item)}
        className="gap-1.5"
        title={`Remove ${item.name} from your profile`}
      >
        {equipping ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Ban className="size-4" aria-hidden />
        )}
        Unequip
      </Button>
    ) : (
      <Button
        size="sm"
        data-testid={`shop-equip-${item.itemId}`}
        disabled={equipping}
        onClick={() => onEquip(item)}
        className="gap-1.5"
        title={`Show ${item.name} on your profile`}
      >
        {equipping ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Wand2 className="size-4" aria-hidden />
        )}
        Equip
      </Button>
    );
  } else {
    action = (
      <Button size="sm" variant="secondary" disabled className="gap-1.5">
        <Check className="size-4" aria-hidden />
        Owned
      </Button>
    );
  }

  return (
    <div
      data-testid={`shop-item-${item.itemId}`}
      className="flex flex-col justify-between rounded-xl border border-border/60 bg-card/60 p-4"
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium leading-tight">{item.name}</h3>
          {item.owned ? (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                equipped ? "bg-primary/20 text-primary" : "bg-emerald-500/15 text-emerald-300"
              }`}
            >
              {equipped ? "Equipped" : "Owned"}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
        <CosmeticPreview item={item} equipped={equipped} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span
          data-testid={`shop-price-${item.itemId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium"
        >
          <Coins className="size-4 text-amber-400" aria-hidden />
          {item.priceLabel}
        </span>
        {action}
      </div>
    </div>
  );
}

function ShopPage() {
  const { token } = useGuest();
  const [shop, setShop] = useState<ShopView | null>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [tickets, setTickets] = useState(0);
  const [buyingTicket, setBuyingTicket] = useState(false);
  const [cosmeticsBusy, setCosmeticsBusy] = useState<string | null>(null);

  const { state: cosmetics, refresh: refreshCosmetics } = useCosmetics(token);

  /** Always re-read the authoritative wallet; never compute a balance locally. */
  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const [view, ticketCount] = await Promise.all([
        shopFn({ data: { token } }),
        tournamentTicketsFn({ data: { token } }).catch(() => 0),
      ]);
      setShop(view);
      setTickets(Number(ticketCount ?? 0));
      setActive((cur) => cur ?? view.categories[0]?.id ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load the shop.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Equipped item id per equippable category, for quick lookup in the grid.
  const equippedByCategory = new Map<string, string | null>();
  if (cosmetics) {
    const cats = cosmetics.categories as Record<string, { equippedId: string | null }>;
    for (const cat of Object.keys(cats)) {
      equippedByCategory.set(cat, cats[cat]?.equippedId ?? null);
    }
  }

  const equip = useCallback(
    async (item: Item) => {
      if (!token || cosmeticsBusy) return;
      setCosmeticsBusy(item.itemId);
      try {
        await cosmeticsEquipFn({ data: { token, itemId: item.itemId } });
        toast.success(`${item.name} is now shown on your profile.`);
        await refreshCosmetics();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not equip this item.");
      } finally {
        setCosmeticsBusy(null);
      }
    },
    [token, cosmeticsBusy, refreshCosmetics],
  );

  const unequip = useCallback(
    async (item: Item) => {
      if (!token || cosmeticsBusy || !isEquippableCategory(item.category)) return;
      setCosmeticsBusy(item.itemId);
      try {
        await cosmeticsUnequipFn({
          data: { token, category: item.category },
        });
        toast.success(`${item.name} removed from your profile.`);
        await refreshCosmetics();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not unequip this item.");
      } finally {
        setCosmeticsBusy(null);
      }
    },
    [token, cosmeticsBusy, refreshCosmetics],
  );

  const buyTicket = useCallback(async () => {
    if (!token || buyingTicket) return;
    setBuyingTicket(true);
    try {
      const res = await buyGodTicketFn({ data: { token } });
      toast.success(res.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Purchase failed.");
    } finally {
      await refresh();
      setBuyingTicket(false);
    }
  }, [token, buyingTicket, refresh]);

  const buy = useCallback(
    async (item: Item) => {
      if (!token || buying) return; // double-click guard; the server is idempotent anyway
      setBuying(item.itemId);
      try {
        // Only an item id crosses the wire — no price, no balance.
        const res = await shopBuyFn({ data: { token, itemId: item.itemId } });
        toast.success(res.message);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Purchase failed.");
      } finally {
        // Re-read the server's balance whether it worked or not, so the UI can
        // never drift from the database.
        await refresh();
        setBuying(null);
      }
    },
    [token, buying, refresh],
  );

  const current = shop?.categories.find((c) => c.id === active) ?? shop?.categories[0] ?? null;

  return (
    <AppShell>
      <PageHeader
        title="🛒 USTAD Shop"
        subtitle="Spend the USTAD Coins you win in quizzes and tournaments. Everything here is cosmetic or customization — nothing affects a game result."
      />

      <CoinOfferBanner token={token} />

      <div
        data-testid="shop-balance"
        className="mb-6 flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-4 py-3"
      >
        <Coins className="size-5 text-amber-400" aria-hidden />
        <span className="text-lg font-semibold">🪙 {shop ? shop.balanceLabel : "…"}</span>
      </div>

      {/* God Tournament Ticket — a consumable entry pass, not a cosmetic. It
          unlocks entry only; it never affects answers, timers or scoring. */}
      <div
        data-testid="shop-god-ticket"
        className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3"
      >
        <div className="min-w-0">
          <h2 className="font-medium">🎟️ {GOD_TICKET.name}</h2>
          <p className="text-sm text-muted-foreground">{GOD_TICKET.description}</p>
          <p className="mt-1 text-sm">
            🪙 {formatIndianCoins(GOD_TICKET.price)} · you own{" "}
            <span data-testid="god-ticket-count">{tickets}</span>
          </p>
        </div>
        <Button
          data-testid="buy-god-ticket"
          disabled={buyingTicket || !shop || shop.wallet.balance < GOD_TICKET.price}
          onClick={buyTicket}
          className="gap-1.5"
        >
          {buyingTicket ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <ShoppingCart className="size-4" aria-hidden />
          )}
          Buy ticket
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading the shop…
        </div>
      ) : !shop || shop.categories.length === 0 ? (
        <p className="text-muted-foreground">The shop is empty right now.</p>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Shop categories">
            {shop.categories.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={current?.id === c.id}
                data-testid={`shop-cat-${c.id}`}
                onClick={() => setActive(c.id)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  current?.id === c.id
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {current ? (
            <section aria-label={current.label}>
              <p className="mb-4 text-sm text-muted-foreground">{current.blurb}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {current.items.map((item) => (
                  <ItemCard
                    key={item.itemId}
                    item={item}
                    balance={shop.wallet.balance}
                    busy={buying === item.itemId}
                    onBuy={buy}
                    equipped={equippedByCategory.get(item.category) === item.itemId}
                    equipping={cosmeticsBusy === item.itemId}
                    onEquip={equip}
                    onUnequip={unequip}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
