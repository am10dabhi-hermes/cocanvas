import {
  Fragment,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import type {
  HtmlAnnotationComment,
  HtmlAnnotationSuggestion,
} from "@roughdraft/rfm";
import {
  AcceptSuggestion,
  RejectSuggestion,
} from "../authoring/SuggestionActions";

export interface HtmlReviewRailProps {
  comments: HtmlAnnotationComment[];
  suggestions: HtmlAnnotationSuggestion[];
  activeCardId?: string | null;
  onCardActivate?: (cardId: string) => void;
  cardRefs?: Map<string, HTMLElement>;
  onAcceptSuggestion?: (suggestionId: string) => void;
  onRejectSuggestion?: (suggestionId: string) => void;
  busySuggestionId?: string | null;
}

type CommentCard = {
  kind: "comment";
  id: string;
  position: number;
  comment: HtmlAnnotationComment;
};

type SuggestionCard = {
  kind: "suggestion";
  id: string;
  position: number;
  suggestion: HtmlAnnotationSuggestion;
};

type Card = CommentCard | SuggestionCard;

function suggestionLabel(suggestion: HtmlAnnotationSuggestion): string {
  switch (suggestion.kind) {
    case "insertion":
      return "Insertion";
    case "deletion":
      return "Deletion";
    case "substitution":
      return "Substitution";
  }
}

function suggestionBody(suggestion: HtmlAnnotationSuggestion): ReactNode {
  if (suggestion.kind === "substitution") {
    return (
      <>
        <del>{suggestion.deletedText}</del> <ins>{suggestion.insertedText}</ins>
      </>
    );
  }
  if (suggestion.kind === "deletion") {
    return <del>{suggestion.deletedText}</del>;
  }
  return <ins>{suggestion.insertedText}</ins>;
}

export function HtmlReviewRail({
  comments,
  suggestions,
  activeCardId = null,
  onCardActivate,
  cardRefs,
  onAcceptSuggestion,
  onRejectSuggestion,
  busySuggestionId = null,
}: HtmlReviewRailProps) {
  const repliesByParent = new Map<string, HtmlAnnotationComment[]>();
  const rootComments: HtmlAnnotationComment[] = [];

  for (const comment of comments) {
    if (comment.replyTo) {
      const list = repliesByParent.get(comment.replyTo) ?? [];
      list.push(comment);
      repliesByParent.set(comment.replyTo, list);
    } else {
      rootComments.push(comment);
    }
  }

  for (const replies of repliesByParent.values()) {
    replies.sort((a, b) => a.position - b.position);
  }

  const rootCards: Card[] = [
    ...rootComments.map<CommentCard>((comment) => ({
      kind: "comment",
      id: comment.id,
      position: comment.position,
      comment,
    })),
    ...suggestions.map<SuggestionCard>((suggestion) => ({
      kind: "suggestion",
      id: suggestion.id,
      position: suggestion.position,
      suggestion,
    })),
  ];

  rootCards.sort((a, b) => a.position - b.position);

  const renderCardRef = (id: string) => (element: HTMLElement | null) => {
    if (!cardRefs) return;
    if (element) {
      cardRefs.set(id, element);
    } else {
      cardRefs.delete(id);
    }
  };

  const renderCommentCard = (
    comment: HtmlAnnotationComment,
    isReply: boolean,
  ): ReactNode => {
    const replies = repliesByParent.get(comment.id) ?? [];
    const isActive = activeCardId === comment.id;
    const status = comment.status ?? "open";

    const handleActivate = (
      event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
    ) => {
      event.stopPropagation();
      onCardActivate?.(comment.id);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleActivate(event);
      }
    };

    return (
      <div
        key={comment.id}
        data-testid="html-review-card"
        data-card-id={comment.id}
        data-card-kind="comment"
        data-status={status}
        data-active={isActive ? "true" : "false"}
        data-reply-to={comment.replyTo ?? undefined}
        role="button"
        tabIndex={0}
        ref={renderCardRef(comment.id)}
        onClick={handleActivate}
        onKeyDown={handleKeyDown}
        className={
          isReply
            ? "rd-html-review-card rd-html-review-card--reply"
            : "rd-html-review-card"
        }
      >
        <header className="rd-html-review-card__header">
          <span className="rd-html-review-card__author">
            {comment.author ?? "Unknown"}
          </span>
          {comment.createdAt ? (
            <time
              className="rd-html-review-card__time"
              dateTime={comment.createdAt}
            >
              {comment.createdAt}
            </time>
          ) : null}
        </header>
        <p className="rd-html-review-card__body">{comment.body}</p>
        {replies.length > 0 ? (
          <div className="rd-html-review-card__replies">
            {replies.map((reply) => (
              <Fragment key={reply.id}>
                {renderCommentCard(reply, true)}
              </Fragment>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const renderSuggestionCard = (
    suggestion: HtmlAnnotationSuggestion,
  ): ReactNode => {
    const isActive = activeCardId === suggestion.id;
    const status = suggestion.status ?? "open";

    const handleActivate = (
      event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
    ) => {
      event.stopPropagation();
      onCardActivate?.(suggestion.id);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleActivate(event);
      }
    };

    return (
      <div
        key={suggestion.id}
        data-testid="html-review-card"
        data-card-id={suggestion.id}
        data-card-kind="suggestion"
        data-suggestion-kind={suggestion.kind}
        data-status={status}
        data-active={isActive ? "true" : "false"}
        role="button"
        tabIndex={0}
        ref={renderCardRef(suggestion.id)}
        onClick={handleActivate}
        onKeyDown={handleKeyDown}
        className="rd-html-review-card rd-html-review-card--suggestion"
      >
        <header className="rd-html-review-card__header">
          <span className="rd-html-review-card__kind">
            {suggestionLabel(suggestion)}
          </span>
          {suggestion.author ? (
            <span className="rd-html-review-card__author">
              {suggestion.author}
            </span>
          ) : null}
        </header>
        <p className="rd-html-review-card__body">
          {suggestionBody(suggestion)}
        </p>
        {status !== "accepted" && status !== "rejected" ? (
          <div className="rd-html-review-card__actions">
            {onAcceptSuggestion ? (
              <AcceptSuggestion
                suggestionId={suggestion.id}
                onAccept={onAcceptSuggestion}
                disabled={busySuggestionId === suggestion.id}
              />
            ) : null}
            {onRejectSuggestion ? (
              <RejectSuggestion
                suggestionId={suggestion.id}
                onReject={onRejectSuggestion}
                disabled={busySuggestionId === suggestion.id}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <aside
      data-testid="html-review-rail"
      className="rd-html-review-rail"
      aria-label="HTML review rail"
    >
      {rootCards.map((card) =>
        card.kind === "comment"
          ? renderCommentCard(card.comment, false)
          : renderSuggestionCard(card.suggestion),
      )}
    </aside>
  );
}
