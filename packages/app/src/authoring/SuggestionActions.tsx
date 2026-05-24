export interface AcceptSuggestionProps {
  suggestionId: string;
  onAccept: (suggestionId: string) => void;
  disabled?: boolean;
}

export function AcceptSuggestion({
  suggestionId,
  onAccept,
  disabled = false,
}: AcceptSuggestionProps) {
  return (
    <button
      type="button"
      data-testid="suggestion-accept"
      data-suggestion-id={suggestionId}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onAccept(suggestionId);
      }}
      className="rd-html-suggestion-action rd-html-suggestion-action--accept"
    >
      Accept
    </button>
  );
}

export interface RejectSuggestionProps {
  suggestionId: string;
  onReject: (suggestionId: string) => void;
  disabled?: boolean;
}

export function RejectSuggestion({
  suggestionId,
  onReject,
  disabled = false,
}: RejectSuggestionProps) {
  return (
    <button
      type="button"
      data-testid="suggestion-reject"
      data-suggestion-id={suggestionId}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onReject(suggestionId);
      }}
      className="rd-html-suggestion-action rd-html-suggestion-action--reject"
    >
      Reject
    </button>
  );
}
