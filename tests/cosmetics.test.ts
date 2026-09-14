import test from "node:test";
import assert from "node:assert/strict";
import {
  EQUIPPABLE_CATEGORIES,
  EQUIP_COLUMN,
  EQUIP_SURFACE,
  isEquippableCategory,
  badgeVisualFor,
  nameStyleVisualFor,
} from "../src/lib/cosmetics-spec";

test("only the three identity categories are equippable", () => {
  assert.deepEqual(EQUIPPABLE_CATEGORIES, ["avatar_frames", "badges", "name_styles"]);
  assert.equal(isEquippableCategory("avatar_frames"), true);
  assert.equal(isEquippableCategory("badges"), true);
  assert.equal(isEquippableCategory("name_styles"), true);
  // The rest of the shop is untouched by the equip system.
  assert.equal(isEquippableCategory("profile_frames"), false);
  assert.equal(isEquippableCategory("board_themes"), false);
  assert.equal(isEquippableCategory("feature_unlocks"), false);
});

test("each equippable category maps to exactly one persistent profile slot", () => {
  assert.equal(EQUIP_COLUMN.avatar_frames, "equipped_frame");
  assert.equal(EQUIP_COLUMN.badges, "equipped_badge");
  assert.equal(EQUIP_COLUMN.name_styles, "equipped_name_style");
  // One distinct column per category => only one active item per category.
  const cols = Object.values(EQUIP_COLUMN);
  assert.equal(new Set(cols).size, EQUIPPABLE_CATEGORIES.length);
});

test("every equippable category declares where it surfaces", () => {
  for (const c of EQUIPPABLE_CATEGORIES) {
    assert.ok(EQUIP_SURFACE[c].length > 0);
  }
});

test("badge visuals resolve known emblems and never throw on unknown refs", () => {
  assert.equal(badgeVisualFor("badge/star").glyph, "⭐");
  assert.equal(badgeVisualFor("badge/champion").glyph, "👑");
  assert.equal(badgeVisualFor("badge/legend").glyph, "🌟");
  // Unknown refs still produce a sensible default emblem.
  assert.ok(badgeVisualFor("badge/unknown-thing").glyph.length > 0);
});

test("name style visuals are inline-style objects that never throw", () => {
  const gold = nameStyleVisualFor("name/gold");
  assert.ok(gold.style["fontWeight"]);
  const champion = nameStyleVisualFor("name/champion");
  assert.equal(champion.style["textTransform"], "uppercase");
  // Unknown refs degrade to a bold treatment.
  const fallback = nameStyleVisualFor("name/unknown-style");
  assert.ok(fallback.style["fontWeight"]);
});
