/**
 * USTAD AI — Equippable profile cosmetics (server authority).
 *
 * EXTENDS the existing Part 8 avatar-frame equip pattern to every category that
 * decorates the user's identity. It duplicates nothing and reuses everything:
 *   • identity      → guest.server.ts (requireGuest)
 *   • ownership     → Part 7 `ustad_purchases` (real, verified purchases)
 *   • catalogue     → Part 7 `ustad_shop_items`
 *   • equip state   → the SAME `profiles` row, one column per category
 *                     (EQUIP_COLUMN in cosmetics-spec.ts), so only ONE item per
 *                     category can ever be equipped and it survives refresh and
 *                     re-login.
 *
 * Single-active semantics fall out of the schema for free: there is one column
 * per category, so setting it replaces whatever was there. Equipping an
 * un-purchased item is refused outright — the frontend can never fake it.
 */
import { requireGuest, db } from "./guest.server";
import { notifyGuest } from "./notification.server";
import {
  EQUIPPABLE_CATEGORIES,
  EQUIP_COLUMN,
  isEquippableCategory,
  type EquippableCategory,
} from "./cosmetics-spec";

type Row = Record<string, unknown>;
/* eslint-disable @typescript-eslint/no-explicit-any */
const sdb = () => db() as any;

export type EquipCosmeticView = {
  itemId: string;
  name: string;
  assetReference: string;
  owned: boolean;
  equipped: boolean;
};

export type CosmeticsView = {
  /** The guest's display name (from their profile), for the identity header. */
  displayName: string;
  categories: Record<
    EquippableCategory,
    { slot: string; equippedId: string | null; items: EquipCosmeticView[] }
  >;
};

/** Display name fallback identical to the certificate/other modules. */
function friendlyName(name: unknown): string {
  const raw = String(name ?? "").trim();
  return raw ? raw : "USTAD AI Learner";
}

async function equippedFromProfile(guestId: string): Promise<{
  name: string | null;
  equipped_frame: string | null;
  equipped_badge: string | null;
  equipped_name_style: string | null;
}> {
  const { data } = await sdb()
    .from("profiles")
    .select("guest_id,name,equipped_frame,equipped_badge,equipped_name_style")
    .eq("guest_id", guestId)
    .maybeSingle();
  const row = (data as Row | null) ?? null;
  const str = (v: unknown): string | null => (v == null ? null : String(v));
  return {
    name: str(row?.["name"]),
    equipped_frame: str(row?.["equipped_frame"]),
    equipped_badge: str(row?.["equipped_badge"]),
    equipped_name_style: str(row?.["equipped_name_style"]),
  };
}

/** Assert an equipped item is really owned; else it is not shown as equipped. */
async function verifiedEquipped(
  guestId: string,
  equippedId: string | null,
): Promise<string | null> {
  if (!equippedId) return null;
  const { data } = await sdb()
    .from("ustad_purchases")
    .select("item_id")
    .eq("guest_id", guestId)
    .eq("item_id", equippedId)
    .eq("ownership_status", "owned")
    .maybeSingle();
  return data ? equippedId : null;
}

/** The full equippable-cosmetic state for this guest, from real records. */
export async function getCosmetics(token: unknown): Promise<CosmeticsView> {
  const guestId = await requireGuest(token);
  const profile = await equippedFromProfile(guestId);
  const displayName = friendlyName(profile["name"]);

  const { data: itemData } = await sdb()
    .from("ustad_shop_items")
    .select("item_id,name,category,asset_reference,sort_order")
    .in("category", EQUIPPABLE_CATEGORIES)
    .eq("status", "active")
    .order("sort_order", { ascending: true });
  const items = (itemData as Row[] | null) ?? [];

  const { data: ownedData } = await sdb()
    .from("ustad_purchases")
    .select("item_id")
    .eq("guest_id", guestId)
    .eq("ownership_status", "owned");
  const owned = new Set(((ownedData as Row[] | null) ?? []).map((p) => String(p["item_id"])));

  const categories = {} as CosmeticsView["categories"];
  for (const category of EQUIPPABLE_CATEGORIES) {
    const slot = EQUIP_COLUMN[category];
    const equippedRaw = profile[slot as keyof typeof profile];
    const equippedId = await verifiedEquipped(guestId, equippedRaw ?? null);
    const catItems = items
      .filter((i) => String(i["category"]) === category)
      .map((i) => {
        const itemId = String(i["item_id"]);
        return {
          itemId,
          name: String(i["name"]),
          assetReference: String(i["asset_reference"] ?? ""),
          owned: owned.has(itemId),
          equipped: equippedId === itemId,
        };
      });
    categories[category] = { slot, equippedId, items: catItems };
  }

  return { displayName, categories };
}

/**
 * Equip an owned cosmetic. `itemId` is matched against its shop category so a
 * caller can never set the wrong slot. Equipping another item of the same
 * category automatically replaces the previous one (single column per slot).
 */
export async function equipCosmetic(input: {
  token: unknown;
  itemId: string;
}): Promise<CosmeticsView> {
  const guestId = await requireGuest(input.token);
  const itemId = String(input.itemId ?? "").slice(0, 120);

  const { data: item } = await sdb()
    .from("ustad_shop_items")
    .select("item_id,name,category,status,asset_reference")
    .eq("item_id", itemId)
    .maybeSingle();
  const itemRow = (item as Row) ?? null;
  if (!itemRow) throw new Error("That item does not exist.");
  if (String(itemRow["status"]) !== "active") throw new Error("That item is not available.");
  const category = String(itemRow["category"]);
  if (!isEquippableCategory(category)) throw new Error("That item cannot be equipped here.");
  const slot = EQUIP_COLUMN[category];

  // Ownership is the ONLY way to equip. Refuse anything unpurchased.
  const { data: owns } = await sdb()
    .from("ustad_purchases")
    .select("item_id")
    .eq("guest_id", guestId)
    .eq("item_id", itemId)
    .eq("ownership_status", "owned")
    .maybeSingle();
  if (!owns) throw new Error("You do not own this item. Buy it in the USTAD Shop first.");

  await sdb()
    .from("profiles")
    .upsert(
      { guest_id: guestId, [slot]: itemId, updated_at: new Date().toISOString() },
      { onConflict: "guest_id" },
    );

  await notifyGuest(
    guestId,
    "shop_cosmetic",
    `equip:${slot}:${itemId}`,
    { cosmeticName: String(itemRow["name"]) },
    { referenceType: "profile_cosmetic", referenceId: itemId, metadata: { slot, category } },
  );

  return getCosmetics(input.token);
}

/** Unequip a cosmetic slot — the identity falls back to its default look. */
export async function unequipCosmetic(input: {
  token: unknown;
  category: EquippableCategory;
}): Promise<CosmeticsView> {
  const guestId = await requireGuest(input.token);
  if (!isEquippableCategory(input.category)) throw new Error("Unknown category.");
  const slot = EQUIP_COLUMN[input.category];
  await sdb()
    .from("profiles")
    .upsert(
      { guest_id: guestId, [slot]: null, updated_at: new Date().toISOString() },
      { onConflict: "guest_id" },
    );
  return getCosmetics(input.token);
}
