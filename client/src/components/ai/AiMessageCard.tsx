import Icon from "../Icon";
import { useEffect, useRef, useState } from "react";
import { safeAiSourceUrl } from "../../utils/aiContracts";
import { getAiMessageEvidence, type AiMessage, type AiEvidencePassage } from "../../utils/aiApi";

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
  feedbackPending?: boolean;
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

const WARNING_LABELS: Record<string, string> = {
  approved_evidence_not_found: "Current approved evidence is unavailable for this question.",
  conflicting_sources: "The sources disagree. Confirm the details with the responsible NUS office.",
  citation_validation_failed: "This answer did not pass source validation.",
  unsupported_knowledge_scope: "This question is outside the assistant’s supported NUS topics.",
  urgent_support_unverified: "Current NUS support details could not be verified.",
  stale_source: "This source may be out of date. Check it before relying on the answer.",
};

export default function AiMessageCard({
  isNewest,
  isStreaming,
  message,
  onFeedback,
  onFollowUp,
  onRetry,
  feedbackPending,
}: AiMessageCardProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [passages, setPassages] = useState<AiEvidencePassage[] | null>(null);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [evidenceError, setEvidenceError] = useState(false);
  const evidenceLock = useRef(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  async function copyAnswer() {
    try {
      await navigator.clipboard.writeText([message.content, ...message.citations.map(c => `${c.title}: ${c.url}`)].join("\n\n"));
      setCopied(true); setCopyError(false);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch { setCopyError(true); }
  }
  async function loadEvidence() {
    if (passages || evidenceLock.current || message.delivery_status !== "completed" ||
        !message.citations.some(c => c.claimIds.some(id => id.startsWith("knowledge_chunk:")))) return;
    evidenceLock.current = true; setLoadingEvidence(true); setEvidenceError(false);
    try { setPassages(await getAiMessageEvidence(message.id)); }
    catch { setEvidenceError(true); }
    finally { setLoadingEvidence(false); evidenceLock.current = false; }
  }
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
      className={`ai-message ai-message-assistant ai-message-${message.delivery_status}`}
    >
      <header className="ai-message-header">
        <span className="ai-message-avatar" aria-hidden="true">
          <Icon name="bot" className="h-4 w-4" />
        </span>
        <div>
          <strong>NUSHub AI</strong>
          <span role={isPending ? "status" : undefined}>
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

      {message.content && (message.delivery_status === "interrupted" || message.delivery_status === "failed") && (
        <p className="ai-response-error" role="status">This response is incomplete. Please retry before relying on it.</p>
      )}

      {message.warnings.length > 0 && (
        <aside className="ai-warnings" aria-label="Answer warnings">
          {message.warnings.map((warning, index) => (
            <p key={`${message.id}-warning-${index}`}>{WARNING_LABELS[warning] ?? (/^[a-z0-9_]+$/.test(warning) ? "Check the official source before relying on this answer." : warning)}</p>
          ))}
        </aside>
      )}

      {message.citations.length > 0 && (
        <details className="ai-sources" onToggle={event => { if (event.currentTarget.open) void loadEvidence(); }}>
          <summary><Icon name="file" className="h-4 w-4" /> {message.citations.length} source{message.citations.length === 1 ? "" : "s"} · inspect the evidence</summary>
          <ol>
            {message.citations.map((citation, index) => {
              const sourceUrl = safeAiSourceUrl(citation.url);
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
                  <small>Checked {formatDate(citation.retrievedAt)} · {citation.sourceId.replace(/^nus_/, "").replaceAll("_", " ")}</small>
                  {passages?.filter(p => p.documentVersionId === citation.documentVersionId && citation.claimIds.includes(p.claimId)).map(p =>
                    <blockquote className="assistant-evidence-passage" key={p.claimId}><span>Retrieved passage · {p.claimId}</span>{p.content}</blockquote>)}
                </li>
              );
            })}
          </ol>
          {loadingEvidence && <p className="assistant-evidence-status" role="status">Loading cited passages…</p>}
          {evidenceError && <p className="assistant-evidence-status" role="status">Passages could not be loaded. <button type="button" onClick={() => void loadEvidence()}>Retry</button></p>}
          <p className="assistant-evidence-status">Citations identify the retrieved evidence. Check whether the passage supports the answer.</p>
        </details>
      )}

      {message.delivery_status === "completed" && (
        <footer className="ai-message-footer">
          <div className="ai-answer-meta">
            {message.module_code && <span>{message.module_code}</span>}
            {message.academic_year && <span>{message.academic_year}</span>}
            {checkedAt && <span>Checked {formatDate(checkedAt)}</span>}
          </div>
          <div className="ai-feedback" aria-label="Rate this answer">
            <button type="button" className="ai-copy" onClick={() => void copyAnswer()} aria-label="Copy answer and sources">{copied ? "Copied" : "Copy"}</button>
            {copyError && <span role="status">Could not copy</span>}
            <span>Was this useful?</span>
            <button
              aria-label="Mark answer as helpful"
              aria-pressed={message.feedback_rating === "helpful"}
              className={
                message.feedback_rating === "helpful" ? "is-selected" : ""
              }
              onClick={() => void onFeedback(message.id, "helpful")}
              type="button"
              disabled={feedbackPending}
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
              disabled={feedbackPending}
            >
              <Icon name="thumbsDown" className="h-4 w-4" />
            </button>
          </div>
        </footer>
      )}

      {message.follow_up_question && message.answer_status === "needs_clarification" ? (
        <p className="ai-clarification-hint">Reply below with the missing details.</p>
      ) : message.follow_up_question && (
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
