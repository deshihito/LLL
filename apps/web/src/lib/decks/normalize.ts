export type DeckCardCandidate = {
  id: string;
  card_type: "action" | "part" | "support";
  parent_card_id: string | null;
  generation_status: string;
  created_at: string;
};

export type DeckSelectionErrorCode = "TOO_MANY_REQUESTED" | "CARD_NOT_OWNED" | "CARD_NOT_READY" | "PART_SELECTION_FORBIDDEN" | "UNSUPPORTED_CARD_TYPE" | "ACTION_LIMIT" | "DECK_LIMIT";

export class DeckSelectionError extends Error {
  readonly code: DeckSelectionErrorCode;
  constructor(code: DeckSelectionErrorCode) { super(code); this.code = code; }
}

/** Expand only explicitly selected actions; their two oldest ready parts follow them as an inseparable group. */
export function expandDeckCardIds(requestedIds: string[], catalog: DeckCardCandidate[], maxCards = 20, maxActions = 5): string[] {
  const uniqueIds = [...new Set(requestedIds)];
  if (uniqueIds.length > maxCards) throw new DeckSelectionError("TOO_MANY_REQUESTED");
  const byId = new Map(catalog.map((card) => [card.id, card]));
  const expanded: string[] = [];
  let actionCount = 0;
  for (const id of uniqueIds) {
    const card = byId.get(id);
    if (!card) throw new DeckSelectionError("CARD_NOT_OWNED");
    if (card.generation_status !== "ready") throw new DeckSelectionError("CARD_NOT_READY");
    if (card.card_type === "part") throw new DeckSelectionError("PART_SELECTION_FORBIDDEN");
    if (card.card_type !== "action" && card.card_type !== "support") throw new DeckSelectionError("UNSUPPORTED_CARD_TYPE");
    expanded.push(card.id);
    if (card.card_type === "action") {
      actionCount += 1;
      if (actionCount > maxActions) throw new DeckSelectionError("ACTION_LIMIT");
      const parts = catalog
        .filter((candidate) => candidate.card_type === "part" && candidate.parent_card_id === card.id && candidate.generation_status === "ready")
        .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id))
        .slice(0, 2);
      for (const part of parts) if (!expanded.includes(part.id)) expanded.push(part.id);
    }
    if (expanded.length > maxCards) throw new DeckSelectionError("DECK_LIMIT");
  }
  return expanded;
}
