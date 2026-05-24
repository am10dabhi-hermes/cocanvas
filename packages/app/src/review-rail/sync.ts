import { useCallback, useRef, useState } from "react";

export interface UseHtmlReviewRailSyncResult {
  activeAnchorId: string | null;
  activeCardId: string | null;
  anchorRefs: Map<string, HTMLElement>;
  cardRefs: Map<string, HTMLElement>;
  handleAnchorActivate: (commentIds: string[]) => void;
  handleCardActivate: (cardId: string) => void;
}

function scrollIntoViewIfPossible(element: HTMLElement) {
  if (typeof element.scrollIntoView === "function") {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function focusIfPossible(element: HTMLElement) {
  if (typeof element.focus === "function") {
    try {
      element.focus({ preventScroll: true });
    } catch {
      element.focus();
    }
  }
}

export function useHtmlReviewRailSync(): UseHtmlReviewRailSyncResult {
  const anchorRefsRef = useRef<Map<string, HTMLElement>>(new Map());
  const cardRefsRef = useRef<Map<string, HTMLElement>>(new Map());
  const [activeAnchorId, setActiveAnchorId] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  const handleAnchorActivate = useCallback((commentIds: string[]) => {
    const first = commentIds[0] ?? null;
    setActiveAnchorId(first);
    setActiveCardId(first);
    if (!first) return;
    const cardElement = cardRefsRef.current.get(first);
    if (cardElement) {
      scrollIntoViewIfPossible(cardElement);
      focusIfPossible(cardElement);
    }
  }, []);

  const handleCardActivate = useCallback((cardId: string) => {
    setActiveCardId(cardId);
    setActiveAnchorId(cardId);
    const anchorElement = anchorRefsRef.current.get(cardId);
    if (anchorElement) {
      scrollIntoViewIfPossible(anchorElement);
      focusIfPossible(anchorElement);
    }
  }, []);

  return {
    activeAnchorId,
    activeCardId,
    anchorRefs: anchorRefsRef.current,
    cardRefs: cardRefsRef.current,
    handleAnchorActivate,
    handleCardActivate,
  };
}
