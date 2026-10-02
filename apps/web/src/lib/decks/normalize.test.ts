import assert from "node:assert/strict";
import { DeckSelectionError, expandDeckCardIds, type DeckCardCandidate } from "./normalize.ts";

const card = (id: string, card_type: DeckCardCandidate["card_type"], parent_card_id: string | null = null, created_at = "2026-01-01T00:00:00Z", generation_status = "ready"): DeckCardCandidate => ({ id, card_type, parent_card_id, created_at, generation_status });
const catalog = [card("action", "action"), card("p3", "part", "action", "2026-01-03"), card("p1", "part", "action", "2026-01-01"), card("p2", "part", "action", "2026-01-02"), card("failed", "part", "action", "2025-01-01", "failed"), card("support", "support")];
assert.deepEqual(expandDeckCardIds(["action", "support", "action"], catalog), ["action", "p1", "p2", "support"]);
assert.deepEqual(expandDeckCardIds(["support"], catalog), ["support"], "support cards never auto-add parts");
const fiveActionsAndSupport = [...Array.from({ length: 5 }, (_, index) => `a${index}`), "support"];
assert.equal(expandDeckCardIds(fiveActionsAndSupport, [...catalog, ...Array.from({ length: 5 }, (_, index) => card(`a${index}`, "action"))]).length, 6, "support cards do not count toward the five-action limit");
const twentySupports = Array.from({ length: 20 }, (_, index) => card(`s${index}`, "support"));
assert.equal(expandDeckCardIds(twentySupports.map((item) => item.id), twentySupports).length, 20, "support cards count toward the 20-card deck limit");
assert.throws(() => expandDeckCardIds(["p1"], catalog), (error: unknown) => error instanceof DeckSelectionError && error.code === "PART_SELECTION_FORBIDDEN");
assert.throws(() => expandDeckCardIds(["missing"], catalog), (error: unknown) => error instanceof DeckSelectionError && error.code === "CARD_NOT_OWNED");
const sixActions = Array.from({ length: 6 }, (_, index) => card(`a${index}`, "action"));
assert.throws(() => expandDeckCardIds(sixActions.map((item) => item.id), sixActions), (error: unknown) => error instanceof DeckSelectionError && error.code === "ACTION_LIMIT");
const twentyCards = Array.from({ length: 10 }, (_, index) => card(`a${index}`, "action"));
for (const item of [...twentyCards]) { catalog.push(item, card(`${item.id}-p1`, "part", item.id), card(`${item.id}-p2`, "part", item.id)); }
assert.throws(() => expandDeckCardIds(twentyCards.map((item) => item.id), catalog, 20, 10), (error: unknown) => error instanceof DeckSelectionError && error.code === "DECK_LIMIT");
console.log("deck normalization tests passed");
