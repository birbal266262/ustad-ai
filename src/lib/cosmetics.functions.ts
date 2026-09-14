/**
 * USTAD AI — Equippable profile cosmetics server-function boundary.
 *
 * The client may: read its OWN equippable-cosmetic state, equip an owned item
 * BY ITEM ID, or unequip one of its OWN slots.
 *
 * The client may never supply: a guest id, a price, an ownership record, or an
 * item it has not genuinely bought. Ownership is always re-verified from Part 7
 * purchase records inside the server engine.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireGuest } from "./guest.server";
import * as cosmetics from "./cosmetics.server";
import type { EquippableCategory } from "./cosmetics-spec";

/** This guest's full cosmetics state (owned + equipped, real records). */
export const cosmeticsStateFn = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data: d }) => {
    await requireGuest(d.token);
    return cosmetics.getCosmetics(d.token);
  });

/** Equip an owned cosmetic item (single-active per category). */
export const cosmeticsEquipFn = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; itemId: string }) => d)
  .handler(async ({ data: d }) => cosmetics.equipCosmetic({ token: d.token, itemId: d.itemId }));

/** Unequip one of this guest's cosmetic slots. */
export const cosmeticsUnequipFn = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; category: EquippableCategory }) => d)
  .handler(async ({ data: d }) =>
    cosmetics.unequipCosmetic({ token: d.token, category: d.category }),
  );
