import Icon from "../Icon";
import type { AiMessage } from "../../utils/aiApi";

type AiMessageCardProps = {
  isNewest: boolean;
  isStreaming: boolean;
  message: AiMessage;
  onFeedback: (
    messageId: string,
    rating: "helpful" | "unhelpful",
  ) => Promise<void>;
  onFollowUp: (question: string) => void;
  onRetry: () => void;
};

const STATUS_LABELS: Record<NonNullable<AiMessage["answer_status"]>, string> = {
  answered: "Grounded answer",
  needs_clarification: "Needs clarification",
  not_verified: "Not verified",
  refused: "Unable to answer",
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function safeSourceUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export default function AiMessageCard({
  isNewest,
  isStreaming,
  message,
  onFeedback,
  onFollowUp,
  onRetry,
}: AiMessageCardProps) {
  if (message.role === "user") {
    return (
      <article className="ai-message ai-message-user">
        <p>{message.content}</p>
      </article>
    );
  }

  const isPending = message.delivery_status === "processing";
  const canRetry =
    isNewest &&
    !isStreaming &&
    (message.delivery_status === "failed" ||
      message.delivery_status === "interrupted");
  const checkedAt = message.citations
    .map((citation) => citation.retrievedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <article
      aria-live={isPending ? "polite" : undefined}
      className={`ai-message ai-message-assistant ai-message-${message.delivery_status}`}
    >
      <header className="ai-message-header">
        <span className="ai-message-avatar" aria-hidden="true">
          <Icon name="bot" className="h-4 w-4" />
        </span>
        <div>
          <strong>NUSHub AI</strong>
          <span>
            {isPending
              ? "Checking official sources…"
              : message.answer_status
                ? STATUS_LABELS[message.answer_status]
                : "Assistant response"}
          </span>
        </div>
      </header>

      {message.content ? (
        <p className="ai-answer-text">{message.content}</p>
      ) : isPending ? (
        <div className="ai-thinking" aria-label="Generating an answer">
          <i />
          <i />
          <i />
        </div>
      ) : (
        <p className="ai-response-error">
          {message.delivery_status === "interrupted"
            ? "This response was stopped before it finished."
            : "The assistant could not complete this response."}
        </p>
      )}

      {message.warnings.length > 0 && (
        <aside className="ai-warnings" aria-label="Answer warnings">
          {message.warnings.map((warning, index) => (
            <p key={`${message.id}-warning-${index}`}>{warning}</p>
          ))}
        </aside>
      )}

      {message.citations.length > 0 && (
        <section className="ai-sources" aria-label="Sources">
          <h3>Sources</h3>
          <ol>
            {message.citations.map((citation, index) => {
              const sourceUrl = safeSourceUrl(citation.url);
              return (
                <li key={`${citation.documentVersionId}-${index}`}>
                  {sourceUrl ? (
                    <a href={sourceUrl} rel="noreferrer" target="_blank">
                      <span>{citation.title}</span>
                      <Icon name="externalLink" className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <span className="ai-source-label">{citation.title}</span>
                  )}
                  {citation.effectiveAt && (
                    <small>Effective {formatDate(citation.effectiveAt)}</small>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {message.delivery_status === "completed" && (
        <footer className="ai-message-footer">
          <div className="ai-answer-meta">
            {message.module_code && <span>{message.module_code}</span>}
            {message.academic_year && <span>{message.academic_year}</span>}
            {checkedAt && <span>Checked {formatDate(checkedAt)}</span>}
          </div>
          <div className="ai-feedback" aria-label="Rate this answer">
            <span>Was this useful?</span>
            <button
              aria-label="Mark answer as helpful"
              aria-pressed={message.feedback_rating === "helpful"}
              className={
                message.feedback_rating === "helpful" ? "is-selected" : ""
              }
              onClick={() => void onFeedback(message.id, "helpful")}
              type="button"
            >
              <Icon name="thumbsUp" className="h-4 w-4" />
            </button>
            <button
              aria-label="Mark answer as not helpful"
              aria-pressed={message.feedback_rating === "unhelpful"}
              className={
                message.feedback_rating === "unhelpful" ? "is-selected" : ""
              }
              onClick={() => void onFeedback(message.id, "unhelpful")}
              type="button"
            >
              <Icon name="thumbsDown" className="h-4 w-4" />
            </button>
          </div>
        </footer>
      )}

      {message.follow_up_question && (
        <button
          className="ai-follow-up"
          disabled={isStreaming}
          onClick={() => onFollowUp(message.follow_up_question as string)}
          type="button"
        >
          <span>Suggested follow-up</span>
          {message.follow_up_question}
        </button>
      )}

      {canRetry && (
        <button className="ai-retry" onClick={onRetry} type="button">
          <Icon name="refresh" className="h-4 w-4" />
          Try again
        </button>
      )}
    </article>
  );
}
