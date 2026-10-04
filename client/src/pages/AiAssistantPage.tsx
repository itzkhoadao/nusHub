import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import AiMessageCard from "../components/ai/AiMessageCard";
import Icon from "../components/Icon";
import AppShell from "../components/layout/AppShell";
import AssistantWelcome from "../components/ai/AssistantWelcome";
import "../components/ai/assistant.css";
import { getAuthToken } from "../utils/authStorage";
import {
  AiApiError,
  createAiConversation,
  deleteAiConversation,
  getAiAvailability,
  getAiConversation,
  listAiConversations,
  streamAiMessage,
  submitAiFeedback,
  renameAiConversation,
  type AiAvailability,
  type AiCitation,
  type AiConversation,
  type AiConversationSummary,
  type AiMessage,
  type AiStreamEvent,
} from "../utils/aiApi";

const MAX_QUESTION_LENGTH = 2000;
const ANSWER_STATUSES = new Set<NonNullable<AiMessage["answer_status"]>>([
  "answered",
  "needs_clarification",
  "not_verified",
  "refused",
]);

function now() {
  return new Date().toISOString();
}

function temporaryMessage(
  id: string,
  role: AiMessage["role"],
  content: string,
): AiMessage {
  const timestamp = now();
  return {
    academic_year: null,
    answer_status: null,
    citations: [],
    content,
    created_at: timestamp,
    delivery_status: role === "user" ? "completed" : "processing",
    error_code: null,
    feedback_rating: null,
    follow_up_question: null,
    id,
    module_code: null,
    role,
    updated_at: timestamp,
    warnings: [],
  };
}

function conversationTitle(question: string) {
  const oneLine = question.replace(/\s+/g, " ").trim();
  return oneLine.length <= 80 ? oneLine : `${oneLine.slice(0, 77)}…`;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function citationValue(value: unknown): AiCitation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const citation = value as Record<string, unknown>;
  const url = stringValue(citation.url);
  const title = stringValue(citation.title);
  const sourceId = stringValue(citation.sourceId);
  const documentVersionId = stringValue(citation.documentVersionId);
  const retrievedAt = stringValue(citation.retrievedAt);
  if (!url || !title || !sourceId || !documentVersionId || !retrievedAt) {
    return null;
  }

  try {
    const protocol = new URL(url).protocol;
    if (protocol !== "https:" && protocol !== "http:") return null;
  } catch {
    return null;
  }

  return {
    claimIds: Array.isArray(citation.claimIds)
      ? citation.claimIds.filter((entry): entry is string => typeof entry === "string")
      : [],
    documentVersionId,
    effectiveAt: stringValue(citation.effectiveAt),
    retrievedAt,
    sourceId,
    title,
    url,
  };
}

function errorMessage(error: unknown) {
  if (error instanceof AiApiError) {
    if (error.code === "AI_DAILY_QUOTA_EXCEEDED") {
      return "You have reached today’s AI question limit. It resets at midnight UTC.";
    }
    if (error.code === "AI_CONCURRENT_LIMIT_EXCEEDED") {
      return "Another answer is still running. Wait for it to finish, then try again.";
    }
    if (error.code === "AI_RESOURCE_NOT_FOUND") {
      return "That conversation no longer exists.";
    }
    return error.message;
  }
  return "The AI assistant could not be reached. Check your connection and try again.";
}

function formatConversationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(date);
}

export default function AiAssistantPage() {
  const { conversationId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [availability, setAvailability] = useState<AiAvailability | null>(null);
  const [conversations, setConversations] = useState<AiConversationSummary[]>([]);
  const [conversation, setConversation] = useState<AiConversation | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [showJump, setShowJump] = useState(false);
  const [dialogAction, setDialogAction] = useState<"delete" | "rename" | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [pendingFeedback, setPendingFeedback] = useState<Set<string>>(new Set());
  const feedbackLocks = useRef(new Set<string>());
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const pinnedRef = useRef(true);
  const mountedRef = useRef(true);
  const sendingRef = useRef(false);
  const sendGenerationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const activeStreamConversationIdRef = useRef<string | null>(null);
  const conversationRef = useRef<AiConversation | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const initialQuestionHandledRef = useRef(false);

  const replaceConversation = useCallback((value: AiConversation | null) => {
    conversationRef.current = value;
    setConversation(value);
  }, []);

  const updateMessage = useCallback(
    (messageId: string, update: (message: AiMessage) => AiMessage) => {
      const current = conversationRef.current;
      if (!current) return;
      replaceConversation({
        ...current,
        messages: current.messages.map((message) =>
          message.id === messageId ? update(message) : message,
        ),
      });
    },
    [replaceConversation],
  );

  const refreshConversations = useCallback(async () => {
    const entries = await listAiConversations();
    setConversations(entries);
  }, []);

  useEffect(() => {
    if (!getAuthToken()) {
      navigate("/login", { replace: true });
      return;
    }

    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      try {
        const status = await getAiAvailability();
        if (cancelled) return;
        setAvailability(status);
        if (status.enabled) await refreshConversations();
      } catch (requestError) {
        if (requestError instanceof AiApiError && requestError.status === 401) {
          navigate("/login", { replace: true });
          return;
        }
        if (!cancelled) setError(errorMessage(requestError));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, refreshConversations]);

  useEffect(() => {
    if (!availability?.enabled) return;
    if (!conversationId) {
      if (!activeStreamConversationIdRef.current) replaceConversation(null);
      return;
    }
    if (activeStreamConversationIdRef.current === conversationId) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);
    void getAiConversation(conversationId)
      .then((entry) => {
        if (!cancelled) replaceConversation(entry);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(errorMessage(requestError));
        if (
          requestError instanceof AiApiError &&
          requestError.code === "AI_RESOURCE_NOT_FOUND"
        ) {
          navigate("/assistant", { replace: true });
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [availability?.enabled, conversationId, navigate, replaceConversation]);

  useEffect(() => {
    if (pinnedRef.current && scrollerRef.current) scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [conversation?.messages, isStreaming]);

  useEffect(() => {
    if (!composerRef.current) return;
    composerRef.current.style.height = "auto";
    composerRef.current.style.height = `${Math.min(composerRef.current.scrollHeight, 180)}px`;
  }, [draft]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  useEffect(() => {
    if (dialogAction) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [dialogAction]);

  useEffect(
    () => {
      mountedRef.current = true;
      return () => { mountedRef.current = false; abortRef.current?.abort(); };
    },
    [],
  );

  const sendQuestion = useCallback(
    async (rawQuestion: string) => {
      const question = rawQuestion.trim();
      if (
        !question ||
        sendingRef.current ||
        !online ||
        isStreaming ||
        isLoading ||
        !availability?.enabled ||
        (conversationId && conversationRef.current?.id !== conversationId)
      ) {
        return;
      }
      if (question.length > MAX_QUESTION_LENGTH) {
        setError(`Keep your question under ${MAX_QUESTION_LENGTH} characters.`);
        return;
      }

      setDraft("");
      setError(null);
      setIsStreaming(true);
      sendingRef.current = true;
      pinnedRef.current = true;
      setShowJump(false);
      const controller = new AbortController();
      const generation = ++sendGenerationRef.current;
      abortRef.current = controller;
      let activeConversation = conversationRef.current;
      let activeConversationId = activeConversation?.id;
      let serverStarted = false;
      let terminalEventReceived = false;
      const tempUserId = `pending-user-${crypto.randomUUID()}`;
      const tempAssistantId = `pending-assistant-${crypto.randomUUID()}`;
      let assistantMessageId = tempAssistantId;

      try {
        if (!activeConversationId) {
          const created = await createAiConversation(conversationTitle(question), controller.signal);
          controller.signal.throwIfAborted();
          if (generation !== sendGenerationRef.current) throw new DOMException("Request cancelled", "AbortError");
          if (!mountedRef.current) return;
          activeConversationId = created.id;
          activeConversation = { ...created, messages: [] };
          activeStreamConversationIdRef.current = created.id;
          replaceConversation(activeConversation);
          setConversations((current) => [
            created,
            ...current.filter((entry) => entry.id !== created.id),
          ]);
          navigate(`/assistant/${created.id}`, { replace: true });
        } else {
          activeStreamConversationIdRef.current = activeConversationId;
        }

        const optimisticConversation: AiConversation = {
          ...(activeConversation as AiConversation),
          messages: [
            ...(activeConversation?.messages ?? []),
            temporaryMessage(tempUserId, "user", question),
            temporaryMessage(tempAssistantId, "assistant", ""),
          ],
          updated_at: now(),
        };
        replaceConversation(optimisticConversation);

        const handleEvent = (event: AiStreamEvent) => {
          if (!mountedRef.current || controller.signal.aborted) return;
          if (event.type === "response.started") {
            const storedMessageId = stringValue(event.data.message_id);
            if (!storedMessageId) return;
            serverStarted = true;
            assistantMessageId = storedMessageId;
            updateMessage(tempAssistantId, (message) => ({
              ...message,
              id: storedMessageId,
            }));
            const storedUserId = stringValue(event.data.user_message_id);
            if (storedUserId) updateMessage(tempUserId, message => ({ ...message, id: storedUserId }));
            return;
          }

          if (event.type === "response.text.delta") {
            const delta = stringValue(event.data.delta);
            if (!delta) return;
            updateMessage(assistantMessageId, (message) => ({
              ...message,
              content: message.content + delta,
            }));
            return;
          }

          if (event.type === "response.citation") {
            const citation = citationValue(event.data.citation);
            if (!citation) return;
            updateMessage(assistantMessageId, (message) => ({
              ...message,
              citations: [...message.citations, citation],
            }));
            return;
          }

          if (event.type === "response.warning") {
            const warning = stringValue(event.data.warning);
            if (!warning) return;
            updateMessage(assistantMessageId, (message) => ({
              ...message,
              warnings: [...message.warnings, warning],
            }));
            return;
          }

          if (event.type === "response.completed") {
            const answerStatus = stringValue(event.data.status);
            terminalEventReceived = true;
            updateMessage(assistantMessageId, (message) => ({
              ...message,
              academic_year: stringValue(event.data.academic_year),
              answer_status:
                answerStatus &&
                ANSWER_STATUSES.has(
                  answerStatus as NonNullable<AiMessage["answer_status"]>,
                )
                  ? (answerStatus as NonNullable<AiMessage["answer_status"]>)
                  : "not_verified",
              delivery_status: "completed",
              follow_up_question: stringValue(event.data.follow_up_question),
              module_code: stringValue(event.data.module_code),
              updated_at: now(),
            }));
            return;
          }

          if (event.type === "response.failed") {
            terminalEventReceived = true;
            updateMessage(assistantMessageId, (message) => ({
              ...message,
              delivery_status: "failed",
              error_code: stringValue(event.data.code) ?? "AI_RESPONSE_FAILED",
              updated_at: now(),
            }));
            setError(
              stringValue(event.data.message) ??
                "The assistant could not complete this response.",
            );
          }
        };

        await streamAiMessage({
          content: question,
          conversationId: activeConversationId,
          onEvent: handleEvent,
          signal: controller.signal,
          idempotencyKey: crypto.randomUUID(),
        });
        if (!terminalEventReceived) {
          throw new AiApiError(
            "The assistant stream ended before the answer was complete.",
            "AI_STREAM_INCOMPLETE",
            502,
          );
        }
      } catch (requestError) {
        if (!mountedRef.current) return;
        const interrupted = controller.signal.aborted;
        updateMessage(assistantMessageId, (message) => ({
          ...message,
          delivery_status: interrupted ? "interrupted" : "failed",
          error_code: interrupted ? "AI_REQUEST_CANCELLED" : "AI_RESPONSE_FAILED",
          updated_at: now(),
        }));
        if (!interrupted) setError(errorMessage(requestError));
        if (!serverStarted && !conversationRef.current?.messages.some(message => message.id === tempUserId)) setDraft(question);
      } finally {
        const storedConversationId = activeConversationId;
        if (mountedRef.current && serverStarted && storedConversationId) {
          await new Promise((resolve) => window.setTimeout(resolve, 100));
          try {
            const stored = await getAiConversation(storedConversationId);
            if (mountedRef.current && conversationRef.current?.id === storedConversationId && !controller.signal.aborted) replaceConversation(stored);
            await refreshConversations();
          } catch (refreshError) {
            if (mountedRef.current) setError(errorMessage(refreshError));
          }
        }
        abortRef.current = null;
        activeStreamConversationIdRef.current = null;
        sendingRef.current = false;
        if (mountedRef.current) { setIsStreaming(false); composerRef.current?.focus(); }
      }
    },
    [
      availability?.enabled,
      conversationId,
      isLoading,
      isStreaming,
      online,
      navigate,
      refreshConversations,
      replaceConversation,
      updateMessage,
    ],
  );

  useEffect(() => {
    const state = location.state as { initialQuestion?: unknown } | null;
    if (
      initialQuestionHandledRef.current ||
      !availability?.enabled ||
      isLoading ||
      typeof state?.initialQuestion !== "string"
    ) {
      return;
    }
    initialQuestionHandledRef.current = true;
    navigate(location.pathname, { replace: true, state: null });
    void sendQuestion(state.initialQuestion);
  }, [
    availability?.enabled,
    isLoading,
    location.pathname,
    location.state,
    navigate,
    sendQuestion,
  ]);

  async function handleDelete() {
    if (!conversation || isStreaming) return;
    setIsDeleting(true);
    setError(null);
    try {
      await deleteAiConversation(conversation.id);
      setConversations((current) =>
        current.filter((entry) => entry.id !== conversation.id),
      );
      replaceConversation(null);
      navigate("/assistant", { replace: true });
      setDialogAction(null);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleFeedback(
    messageId: string,
    rating: "helpful" | "unhelpful",
  ) {
    if (feedbackLocks.current.has(messageId)) return;
    feedbackLocks.current.add(messageId);
    setPendingFeedback(new Set(feedbackLocks.current));
    const original = conversationRef.current?.messages.find(
      (message) => message.id === messageId,
    )?.feedback_rating;
    updateMessage(messageId, (message) => ({
      ...message,
      feedback_rating: rating,
    }));
    try {
      await submitAiFeedback(messageId, rating);
    } catch (requestError) {
      updateMessage(messageId, (message) => ({
        ...message,
        feedback_rating: original ?? null,
      }));
      setError(errorMessage(requestError));
    } finally {
      feedbackLocks.current.delete(messageId);
      if (mountedRef.current) setPendingFeedback(new Set(feedbackLocks.current));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendQuestion(draft);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (draft.trim() && !isStreaming) void sendQuestion(draft);
    }
  }

  function startNewConversation() {
    if (isStreaming) return;
    setError(null);
    replaceConversation(null);
    setIsLoading(false);
    setDraft("");
    setHistoryOpen(false);
    pinnedRef.current = true;
    navigate("/assistant");
  }

  function openConversation(id: string) {
    if (isStreaming || id === conversation?.id) return;
    setError(null);
    setIsLoading(true);
    replaceConversation(null);
    setHistoryOpen(false);
    pinnedRef.current = true;
    navigate(`/assistant/${id}`);
  }

  function retryMessage(index: number) {
    const previous = conversation?.messages[index - 1];
    if (previous?.role === "user") void sendQuestion(previous.content);
  }

  const remainingCharacters = MAX_QUESTION_LENGTH - draft.length;
  const visibleConversations = conversations.filter(entry => entry.title.toLowerCase().includes(historySearch.trim().toLowerCase()));
  function choosePrompt(question: string) { setDraft(question); composerRef.current?.focus(); }
  async function handleRename(event: FormEvent) {
    event.preventDefault();
    if (!conversation || !renameTitle.trim() || isRenaming) return;
    setIsRenaming(true);
    try {
      const updated = await renameAiConversation(conversation.id, renameTitle.trim());
      if (conversationRef.current?.id === updated.id) replaceConversation({ ...conversationRef.current, ...updated });
      setConversations(current => current.map(entry => entry.id === updated.id ? updated : entry));
      setDialogAction(null);
    } catch (requestError) { setError(errorMessage(requestError)); }
    finally { setIsRenaming(false); }
  }

  return (
    <AppShell contextualPlaceholder="Search NUSHub">
      <div className="ai-page assistant-studio">
        <section className="ai-hero">
          <div>
            <p><span className="assistant-status-dot" /> YOUR CAMPUS COMPANION</p>
            <h1>A little clarity. <em>A lot less searching.</em></h1>
            <span>
              Explore NUS with answers you can trace. If the evidence is missing, we’ll say so.
            </span>
          </div>
          <div className="ai-provider-note">
            <Icon name="bot" className="h-5 w-5" />
            <span>
              Questions are sent to <strong>Google Gemini</strong> for
              processing. Please keep passwords and private records out of your questions.
            </span>
          </div>
        </section>
        {!online && <div className="ai-page-error" role="status">You’re offline. Your draft is safe here; reconnect to send it.</div>}

        {error && (
          <div className="ai-page-error" role="alert">
            <span>{error}</span>
            <button onClick={() => setError(null)} type="button">
              Dismiss
            </button>
          </div>
        )}

        {isLoading && !availability ? (
          <section className="ai-loading-panel" aria-live="polite">
            <div className="ai-thinking"><i /><i /><i /></div>
            Checking assistant availability…
          </section>
        ) : !availability || !availability.enabled ? (
          <section className="ai-unavailable">
            <span className="ai-message-avatar"><Icon name="bot" /></span>
            <h2>
              {availability
                ? "The assistant is not available yet"
                : "The assistant could not be reached"}
            </h2>
            <p>
              {availability
                ? "It is safely disabled in this environment. Forum, groups, and chat continue to work normally."
                : "Try again later. No question was sent and the rest of NUSHub is still available."}
            </p>
          </section>
        ) : (
          <div className={`ai-layout ${historyOpen ? "history-is-open" : ""}`}>
            <aside className="ai-history" aria-label="AI conversation history">
              <div className="ai-history-header">
                <div>
                  <span>Conversations</span>
                  <small>{conversations.length === 100 ? "100 most recent" : `${conversations.length} saved`}</small>
                </div>
                <button
                  aria-label="Start a new AI conversation"
                  disabled={isStreaming}
                  onClick={startNewConversation}
                  type="button"
                >
                  <Icon name="plus" className="h-4 w-4" />
                </button>
              </div>
              <label className="assistant-history-search"><Icon name="search" className="h-4 w-4" /><input aria-label="Search conversations" placeholder="Find a conversation…" value={historySearch} onChange={event => setHistorySearch(event.target.value)} /></label>
              <div className="ai-history-list">
                {visibleConversations.length === 0 ? (
                  <p>{historySearch ? "No matching conversations." : "A fresh start. Your conversations will appear here."}</p>
                ) : (
                  visibleConversations.map((entry) => (
                    <button
                      className={entry.id === conversation?.id ? "is-active" : ""}
                      disabled={isStreaming}
                      key={entry.id}
                      onClick={() => openConversation(entry.id)}
                      type="button"
                    >
                      <span>{entry.title}</span>
                      <small>{formatConversationTime(entry.updated_at)}</small>
                    </button>
                  ))
                )}
              </div>
              <div className="assistant-history-note"><Icon name="file" className="h-4 w-4" /><p>Source links, clear limits.<small>Check consequential details with NUS.</small></p></div>
            </aside>

            <section className="ai-workspace" aria-label="AI conversation">
              <header className="ai-workspace-header">
                <button className="assistant-history-toggle" type="button" aria-expanded={historyOpen} aria-label="Toggle conversation history" onClick={() => setHistoryOpen(!historyOpen)}><Icon name="message" /></button>
                <div>
                  <h2>{conversation?.title ?? "NUSHub Assistant"}</h2>
                  <p><span className="assistant-status-dot" />{isStreaming ? "Preparing your response…" : "Ready when you are"}</p>
                </div>
                {conversation && (
                  <div className="assistant-thread-actions"><button type="button" disabled={isStreaming} onClick={() => { setRenameTitle(conversation.title); setDialogAction("rename"); }} aria-label="Rename conversation">Rename</button><button
                    aria-label="Delete this conversation"
                    className="ai-delete"
                    disabled={isStreaming || isDeleting}
                    onClick={() => setDialogAction("delete")}
                    type="button"
                  >
                    <Icon name="trash" className="h-4 w-4" />
                    <span>{isDeleting ? "Deleting…" : "Delete"}</span>
                  </button>
                  </div>
                )}
              </header>

              <div className="ai-messages" ref={scrollerRef} onScroll={() => {
                const el = scrollerRef.current;
                if (el) { pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90; setShowJump(!pinnedRef.current); }
              }} aria-label="Conversation messages">
                {conversation?.has_earlier_messages && <p className="assistant-archive-note">Showing the latest 200 messages in this conversation.</p>}
                {isLoading && <div className="assistant-loading" role="status"><div className="ai-thinking"><i /><i /><i /></div>Loading your conversation…</div>}
                {!conversation || conversation.messages.length === 0 ? (
                  <AssistantWelcome onChoose={choosePrompt} disabled={isLoading || isStreaming} />
                ) : (
                  conversation.messages.map((message, index) => (
                    <AiMessageCard
                      isNewest={index === conversation.messages.length - 1}
                      isStreaming={isStreaming}
                      key={message.id}
                      message={message}
                      onFeedback={handleFeedback}
                      onFollowUp={choosePrompt}
                      feedbackPending={pendingFeedback.has(message.id)}
                      onRetry={() => retryMessage(index)}
                    />
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
              {showJump && <button className="assistant-jump" type="button" onClick={() => {
                pinnedRef.current = true; setShowJump(false);
                scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
              }}>Jump to latest ↓</button>}

              <div className="ai-composer-wrap">
                <form className="ai-composer" onSubmit={handleSubmit}>
                  <textarea
                    ref={composerRef}
                    aria-label="Ask a NUS question"
                    aria-describedby="assistant-composer-hint"
                    disabled={!availability?.enabled || isLoading}
                    aria-busy={isLoading}
                    maxLength={MAX_QUESTION_LENGTH}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    placeholder="Ask anything about your NUS journey…"
                    rows={2}
                    value={draft}
                  />
                  <div className="ai-composer-actions">
                    <span className={remainingCharacters < 200 ? "is-near-limit" : ""}>
                      {remainingCharacters.toLocaleString()} characters left
                    </span>
                    {isStreaming ? (
                      <button
                        className="ai-stop"
                        onClick={event => { event.preventDefault(); sendGenerationRef.current++; abortRef.current?.abort(); }}
                        type="button"
                      >
                        <Icon name="square" className="h-3.5 w-3.5" />
                        Stop
                      </button>
                    ) : (
                      <button disabled={!draft.trim() || isLoading || !online} type="submit">
                        <span>Send</span>
                        <Icon name="send" className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </form>
                <p id="assistant-composer-hint">
                  Enter to send · Shift + Enter for a new line. Saved to your account until deleted. Verify important details.
                </p>
              </div>
            </section>
          </div>
        )}
        <dialog ref={dialogRef} className="assistant-dialog" onCancel={() => setDialogAction(null)} onClose={() => setDialogAction(null)}>
          {dialogAction === "delete" ? <>
            <span className="assistant-dialog-icon"><Icon name="trash" /></span><h2>Delete this conversation?</h2>
            <p>“{conversation?.title}” and its messages will be permanently removed.</p>
            <div><button type="button" autoFocus disabled={isDeleting} onClick={() => setDialogAction(null)}>Keep conversation</button><button className="is-destructive" type="button" disabled={isDeleting} onClick={() => void handleDelete()}>{isDeleting ? "Deleting…" : "Delete"}</button></div>
          </> : <form onSubmit={event => void handleRename(event)}>
            <h2>Make it easy to find</h2><label>Conversation name<input autoFocus maxLength={80} value={renameTitle} onChange={event => setRenameTitle(event.target.value)} required /></label>
            <div><button type="button" disabled={isRenaming} onClick={() => setDialogAction(null)}>Cancel</button><button type="submit" disabled={isRenaming || !renameTitle.trim()}>{isRenaming ? "Saving…" : "Save name"}</button></div>
          </form>}
        </dialog>
      </div>
    </AppShell>
  );
}
