import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";

// import HTTP API functions
import {
  getConversations,
  getCurrentUserId,
  getMessages,
  conversationsKey,
  messagesKey,
  sendMessage,
  type ChatMessage,
  type Conversation,
} from "../utils/chatApi";
import { getChatSocket } from "../utils/socket";

const emptyConversations: Conversation[] = [];
const emptyMessages: ChatMessage[] = [];

// converts db time into readable time
function formatTime(value: string | null) {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  }); // for ex, 06:50
}

function getCurrentUser() {
  const storedUser = localStorage.getItem("user");
  return storedUser ? JSON.parse(storedUser) : null;
}

// adds a message to the message list, avoids duplicates
function appendMessage(messages: ChatMessage[] | undefined, message: ChatMessage) {
  const currentMessages = messages || [];

  if (currentMessages.some((item) => item.id === message.id)) {
    return currentMessages;
  }

  return [...currentMessages, message];
}

// updates left sidebar list after a new message arrives
function updateConversationPreview(
  conversations: Conversation[] | undefined,
  message: ChatMessage,
) {
  const currentConversations = conversations || [];

  return currentConversations
    .map((conversation) =>
      conversation.id === message.conversation_id
        ? {
            ...conversation,
            last_message_id: message.id,
            last_message_body: message.body,
            last_message_created_at: message.created_at,
            last_sender_id: message.sender_id,
            last_sender_username:
              message.sender_username || conversation.last_sender_username,
            updated_at: message.created_at,
          }
        : conversation,
    )
    .sort((first, second) => {
      const firstTime = new Date(
        first.last_message_created_at || first.updated_at,
      ).getTime();
      const secondTime = new Date(
        second.last_message_created_at || second.updated_at,
      ).getTime();

      return secondTime - firstTime;
    });
}

export default function ChatPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useMemo(() => getCurrentUser(), []);
  const userId = useMemo(() => getCurrentUserId(), []);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  // replace loadConversations()
  const conversationsQuery = useQuery({
    queryKey: userId ? conversationsKey(userId) : ["conversations", "guest"], // cache key
    queryFn: getConversations, // function that fetches data from backend
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000, // keep unused cached data for 30 mins
    refetchOnWindowFocus: false,
  });

  // replace loadMessages()
  const messagesQuery = useQuery({
    queryKey:
      userId && conversationId
        ? messagesKey(userId, conversationId)
        : ["messages", "guest", "idle"],
    queryFn: () => getMessages(conversationId as string),
    enabled: Boolean(userId && conversationId),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // getting data from queries
  const conversations = conversationsQuery.data || emptyConversations;
  const messages = messagesQuery.data || emptyMessages;

  // useMemo: calculates a value and only recalculates it when its dependencies change
  // finds the currently selected conversation
  const activeConversation = useMemo(
    () =>
      conversations.find(
        (conversation) => conversation.id === conversationId,
      ) || null,
    [conversations, conversationId],
  );

  useEffect(() => {
    if (!user) {
      navigate("/login");
    }
  }, [navigate, user]);

  // listen for realtime messages and update TanStack Query cache
  useEffect(() => {
    const socket = getChatSocket(); // get socket connection

    if (!socket) {
      return;
    }

    // instead of updating states, now update by setQueryData()
    const handleNewMessage = (message: ChatMessage) => {
      if (!userId) {
        return;
      }

      queryClient.setQueryData<ChatMessage[]>(
        messagesKey(userId, message.conversation_id), // update cache
        (currentMessages) => appendMessage(currentMessages, message),
      );

      queryClient.setQueryData<Conversation[]>(
        conversationsKey(userId), // update cache
        (currentConversations) =>
          updateConversationPreview(currentConversations, message),
      );
    };

    socket.on("message:new", handleNewMessage);

    return () => {
      socket.off("message:new", handleNewMessage);
    }; // cleanup, remove listener
  }, [queryClient, userId]);

  // replace sending, setSending state
  const sendMessageMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      sendMessage(id, body),
    onSuccess: (message) => {
      setDraft("");
      setError("");

      // update cache on sending
      if (!userId) {
        return;
      }

      queryClient.setQueryData<ChatMessage[]>(
        messagesKey(userId, message.conversation_id),
        (currentMessages) => appendMessage(currentMessages, message),
      );

      queryClient.setQueryData<Conversation[]>(
        conversationsKey(userId),
        (currentConversations) =>
          updateConversationPreview(currentConversations, message),
      );
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to send message");
    },
  });

  // runs when the user submits the message form
  const handleSendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = draft.trim();

    if (!conversationId || !body || sendMessageMutation.isPending) {
      return;
    }

    setError("");
    sendMessageMutation.mutate({ id: conversationId, body }); // let React Query func handle
  };

  const handleDraftKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  const displayedError =
    error ||
    (conversationsQuery.error instanceof Error
      ? conversationsQuery.error.message
      : "") ||
    (messagesQuery.error instanceof Error ? messagesQuery.error.message : "");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversationId, messages.length]);

  return (
    <AppShell contextualPlaceholder="Search chats..." user={user}>
      <section className="grid h-[calc(100vh-8rem)] min-h-0 overflow-hidden rounded-lg border border-surface-variant bg-white shadow-soft lg:grid-cols-[21rem_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-surface-variant bg-surface-low lg:border-b-0 lg:border-r">
          <div className="border-b border-surface-variant p-5">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">
              Messages
            </p>
            <h1 className="mt-1 text-2xl font-bold text-app-text">Chat</h1>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {conversationsQuery.isLoading ? (
              <p className="p-3 text-sm font-semibold text-app-muted">
                Loading conversations...
              </p>
            ) : conversations.length === 0 ? (
              <div className="rounded-lg border border-dashed border-surface-variant bg-white p-4 text-sm text-app-muted">
                No conversations yet. Open another user's profile and start a
                chat from there.
              </div>
            ) : (
              <div className="space-y-2">
                {conversations.map((conversation) => {
                  const isActive = conversation.id === conversationId;
                  const displayName =
                    conversation.other_username || "NUSHub user";
                  const initial = displayName.charAt(0).toUpperCase();

                  return (
                    <Link
                      className={`flex gap-3 rounded-lg border p-3 transition-colors ${
                        isActive
                          ? "border-primary/25 bg-primary-fixed text-primary"
                          : "border-transparent bg-white text-app-text hover:border-surface-variant hover:bg-surface-low"
                      }`}
                      key={conversation.id}
                      to={`/chat/${conversation.id}`}
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                        {initial}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-bold">
                            {displayName}
                          </p>
                          <span className="shrink-0 text-xs font-semibold text-app-muted">
                            {formatTime(conversation.last_message_created_at)}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-sm text-app-muted">
                          {conversation.last_message_body || "No messages yet"}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <div className="flex min-h-0 flex-col">
          {activeConversation ? (
            <>
              <header className="flex items-center justify-between border-b border-surface-variant px-5 py-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-app-muted">
                    Conversation with
                  </p>
                  <h2 className="text-lg font-bold text-app-text">
                    {activeConversation.other_username || "NUSHub user"}
                  </h2>
                </div>
                <Icon name="message" className="h-5 w-5 text-primary" />
              </header>

              {displayedError && (
                <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm font-semibold text-app-danger">
                  {displayedError}
                </div>
              )}

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-surface-low px-5 py-5">
                {messagesQuery.isLoading ? (
                  <p className="text-sm font-semibold text-app-muted">
                    Loading messages...
                  </p>
                ) : messages.length === 0 ? (
                  <div className="mx-auto mt-16 max-w-sm rounded-lg border border-dashed border-surface-variant bg-white p-6 text-center">
                    <Icon
                      name="message"
                      className="mx-auto h-8 w-8 text-primary"
                    />
                    <h3 className="mt-3 text-lg font-bold text-app-text">
                      Start the conversation
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-app-muted">
                      Send the first message and it will appear here.
                    </p>
                  </div>
                ) : (
                  messages.map((message) => {
                    const isMine = message.sender_id === user?.id;

                    return (
                      <div
                        className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                        key={message.id}
                      >
                        <div
                          className={`max-w-[min(34rem,80%)] rounded-2xl px-4 py-3 shadow-sm ${
                            isMine
                              ? "rounded-br-md bg-primary text-white"
                              : "rounded-bl-md bg-white text-app-text"
                          }`}
                        >
                          <p className="whitespace-pre-wrap text-sm leading-6">
                            {message.body}
                          </p>
                          <p
                            className={`mt-2 text-[11px] font-semibold ${
                              isMine ? "text-white/70" : "text-app-muted"
                            }`}
                          >
                            {formatTime(message.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <form
                className="flex items-end gap-3 border-t border-surface-variant bg-white p-4"
                onSubmit={handleSendMessage}
              >
                <textarea
                  className="app-input min-h-12 flex-1 resize-none"
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleDraftKeyDown}
                  placeholder="Write a message..."
                  rows={1}
                  value={draft}
                />
                <button
                  className="app-button-primary h-12 px-5"
                  disabled={sendMessageMutation.isPending || !draft.trim()}
                  type="submit"
                >
                  Send
                </button>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <div className="max-w-md text-center">
                <Icon
                  name="message"
                  className="mx-auto h-10 w-10 text-primary"
                />
                <h2 className="mt-4 text-2xl font-bold text-app-text">
                  Select a chat
                </h2>
                <p className="mt-2 text-sm leading-6 text-app-muted">
                  Choose a conversation from the list, or start one from a user
                  profile.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
