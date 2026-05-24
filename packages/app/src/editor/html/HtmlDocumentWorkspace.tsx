import { useCallback, useEffect, useState } from "react";
import {
  acceptHtmlSuggestion,
  addHtmlComment,
  rejectHtmlSuggestion,
  type AddHtmlCommentInput,
  type AnnotatedHtmlDoc,
} from "@roughdraft/rfm";
import { HtmlReadonlyView } from "./HtmlReadonlyView";
import { HtmlReviewRail } from "../../review-rail/HtmlReviewRail";
import { useHtmlReviewRailSync } from "../../review-rail/sync";
import { AddCommentComposer } from "../../authoring/AddCommentComposer";

export interface HtmlDocumentWorkspaceProps {
  documentPath: string;
  projectPath?: string | null;
  absolutePath?: string | null;
}

interface HtmlFileResponse {
  id: string;
  title: string;
  content: string;
  version: string;
  document: AnnotatedHtmlDoc;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; page: HtmlFileResponse }
  | { kind: "error"; message: string };

function buildHtmlFileUrl(
  documentPath: string,
  projectPath?: string | null,
): string {
  const url = new URL("/api/html-file", window.location.origin);
  url.searchParams.set("path", documentPath);
  if (projectPath) url.searchParams.set("projectPath", projectPath);
  return `${url.pathname}${url.search}`;
}

function newCommentId(): string {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function HtmlDocumentWorkspace({
  documentPath,
  projectPath,
  absolutePath,
}: HtmlDocumentWorkspaceProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [selectedText, setSelectedText] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerSelection, setComposerSelection] = useState("");
  const [saving, setSaving] = useState(false);
  const [busySuggestionId, setBusySuggestionId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const sync = useHtmlReviewRailSync();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setState({ kind: "loading" });
      try {
        const res = await fetch(buildHtmlFileUrl(documentPath, projectPath));
        if (!res.ok) {
          setState({
            kind: "error",
            message: `Could not open HTML file (${res.status.toString()}).`,
          });
          return;
        }
        const payload = (await res.json()) as HtmlFileResponse;
        if (cancelled) return;
        setState({ kind: "loaded", page: payload });
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load HTML file:", error);
        setState({ kind: "error", message: "Could not open that HTML file." });
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [documentPath, projectPath]);

  const persistDocument = useCallback(
    async (nextDoc: AnnotatedHtmlDoc, expectedVersion: string) => {
      const response = await fetch(
        buildHtmlFileUrl(documentPath, projectPath),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            document: nextDoc,
            expectedVersion,
            path: documentPath,
            projectPath,
          }),
        },
      );
      if (!response.ok) {
        throw new Error(`Save failed (${response.status.toString()})`);
      }
      return (await response.json()) as HtmlFileResponse;
    },
    [documentPath, projectPath],
  );

  const handleAddCommentClick = useCallback(() => {
    if (!selectedText.trim()) return;
    setComposerSelection(selectedText);
    setComposerOpen(true);
    setSaveError(null);
  }, [selectedText]);

  const handleComposerCancel = useCallback(() => {
    setComposerOpen(false);
  }, []);

  const handleComposerSubmit = useCallback(
    async ({ body }: { body: string }) => {
      if (state.kind !== "loaded") return;
      const targetText = composerSelection;
      if (!targetText.trim()) return;
      setSaving(true);
      setSaveError(null);
      try {
        const input: AddHtmlCommentInput = {
          id: newCommentId(),
          anchor: { text: targetText },
          author: "you@example.com",
          createdAt: new Date().toISOString(),
          body,
        };
        const nextDoc = addHtmlComment(state.page.document, input);
        const updated = await persistDocument(nextDoc, state.page.version);
        setState({ kind: "loaded", page: updated });
        setComposerOpen(false);
        setSelectedText("");
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "Save failed");
      } finally {
        setSaving(false);
      }
    },
    [composerSelection, persistDocument, state],
  );

  const handleAcceptSuggestion = useCallback(
    async (suggestionId: string) => {
      if (state.kind !== "loaded") return;
      setBusySuggestionId(suggestionId);
      setSaveError(null);
      try {
        const nextDoc = acceptHtmlSuggestion(state.page.document, {
          id: suggestionId,
        });
        const updated = await persistDocument(nextDoc, state.page.version);
        setState({ kind: "loaded", page: updated });
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "Save failed");
      } finally {
        setBusySuggestionId(null);
      }
    },
    [persistDocument, state],
  );

  const handleRejectSuggestion = useCallback(
    async (suggestionId: string) => {
      if (state.kind !== "loaded") return;
      setBusySuggestionId(suggestionId);
      setSaveError(null);
      try {
        const nextDoc = rejectHtmlSuggestion(state.page.document, {
          id: suggestionId,
        });
        const updated = await persistDocument(nextDoc, state.page.version);
        setState({ kind: "loaded", page: updated });
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "Save failed");
      } finally {
        setBusySuggestionId(null);
      }
    },
    [persistDocument, state],
  );

  if (state.kind === "loading") {
    return (
      <div
        data-testid="html-document-workspace"
        data-state="loading"
        className="flex h-full items-center justify-center text-slate-500"
      >
        Loading HTML…
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div
        data-testid="html-document-workspace"
        data-state="error"
        role="alert"
        className="flex h-full items-center justify-center text-red-600"
      >
        {state.message}
      </div>
    );
  }

  const { page } = state;
  const displayPath = absolutePath ?? documentPath;
  const canAddComment = selectedText.trim().length > 0 && !saving;

  return (
    <div
      data-testid="html-document-workspace"
      data-state="loaded"
      className="flex h-full min-h-0 flex-1 flex-row overflow-hidden"
    >
      <section
        data-testid="html-document-pane"
        className="flex-1 min-w-0 overflow-auto p-6"
      >
        <header className="mb-4 flex flex-row items-start justify-between gap-4">
          <div>
            <h1
              className="text-xl font-semibold"
              data-testid="html-document-title"
            >
              {page.title}
            </h1>
            <p
              className="text-xs text-slate-500"
              data-testid="html-document-path"
            >
              {displayPath}
            </p>
          </div>
          <button
            type="button"
            data-testid="html-add-comment-button"
            disabled={!canAddComment}
            onClick={handleAddCommentClick}
            className="rd-html-add-comment-button"
          >
            Add comment
          </button>
        </header>
        {saveError ? (
          <p
            data-testid="html-save-error"
            role="alert"
            className="mb-3 text-sm text-red-600"
          >
            {saveError}
          </p>
        ) : null}
        <HtmlReadonlyView
          document={page.document}
          activeAnchorId={sync.activeAnchorId}
          onAnchorActivate={sync.handleAnchorActivate}
          anchorRefs={sync.anchorRefs}
          onSelectionChange={setSelectedText}
        />
        <AddCommentComposer
          open={composerOpen}
          selectedText={composerSelection}
          onSubmit={handleComposerSubmit}
          onCancel={handleComposerCancel}
          busy={saving}
        />
      </section>
      <HtmlReviewRail
        comments={page.document.comments}
        suggestions={page.document.suggestions}
        activeCardId={sync.activeCardId}
        onCardActivate={sync.handleCardActivate}
        cardRefs={sync.cardRefs}
        onAcceptSuggestion={handleAcceptSuggestion}
        onRejectSuggestion={handleRejectSuggestion}
        busySuggestionId={busySuggestionId}
      />
    </div>
  );
}
