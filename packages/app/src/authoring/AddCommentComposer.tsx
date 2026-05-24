import { useEffect, useRef, useState } from "react";

export interface AddCommentSubmitInput {
  body: string;
}

export interface AddCommentComposerProps {
  open: boolean;
  selectedText: string;
  onSubmit: (input: AddCommentSubmitInput) => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string | null;
}

export function AddCommentComposer({
  open,
  selectedText,
  onSubmit,
  onCancel,
  busy = false,
  error = null,
}: AddCommentComposerProps) {
  const [body, setBody] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open) {
      setBody("");
      textareaRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  const trimmed = body.trim();
  const canSubmit = trimmed.length > 0 && !busy;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({ body: trimmed });
  };

  return (
    <div
      data-testid="add-comment-composer"
      role="dialog"
      aria-label="Add comment"
      className="rd-html-add-comment-composer"
    >
      <header className="rd-html-add-comment-composer__header">
        <span className="rd-html-add-comment-composer__label">Comment on</span>
        <span
          data-testid="add-comment-selected-text"
          className="rd-html-add-comment-composer__selected"
        >
          {selectedText}
        </span>
      </header>
      <textarea
        ref={textareaRef}
        data-testid="add-comment-body"
        className="rd-html-add-comment-composer__body"
        placeholder="Comment"
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        rows={3}
      />
      {error ? (
        <p
          data-testid="add-comment-error"
          role="alert"
          className="rd-html-add-comment-composer__error"
        >
          {error}
        </p>
      ) : null}
      <footer className="rd-html-add-comment-composer__actions">
        <button
          type="button"
          data-testid="add-comment-cancel"
          onClick={() => {
            onCancel();
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="add-comment-save"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </footer>
    </div>
  );
}
