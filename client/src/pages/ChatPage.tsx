import {
  Suspense,
  lazy,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type { EmojiClickData } from "emoji-picker-react"; // object returned when user clicks an emoji
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import UserAvatar from "../components/ui/UserAvatar";
import { API_URL } from "../utils/api";
import { getStoredUser } from "../utils/authStorage";

// import HTTP API functions
import {
  getConversations,
  getCurrentUserId,
  getMessages,
  markConversationRead,
  conversationsKey,
  messagesKey,
  sendMessage,
  type ChatMessage,
  type MessageReadReceipt,
  type Conversation,
} from "../utils/chatApi";
import { getChatSocket } from "../utils/socket";

const emptyConversations: Conversation[] = [];
const emptyMessages: ChatMessage[] = [];
const EmojiPicker = lazy(() => import("emoji-picker-react")); // loads only if user opens picker
const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_MESSAGE = 5;

function getLocalDateKey(value: string | Date) {
  return new Date(value).toLocaleDateString("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: userTimeZone,
    year: "numeric",
  });
}

// converts db time into readable time
function formatTime(value: string | null) {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: userTimeZone,
  }); // for ex, 06:50
}

function formatDateLabel(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (getLocalDateKey(date) === getLocalDateKey(today)) {
    return "Today";
  }

  if (getLocalDateKey(date) === getLocalDateKey(yesterday)) {
    return "Yesterday";
  }

  return date.toLocaleDateString([], {
    day: "numeric",
    month: "numeric",
    timeZone: userTimeZone,
  });
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageAttachment(mimeType: string) {
  return mimeType.startsWith("image/");
}

function getAttachmentUrl(fileUrl: string) {
  if (fileUrl.startsWith("http")) {
    return fileUrl;
  }

  return `${API_URL}${fileUrl}`;
}

function getAttachmentPreviewText(count: number) {
  if (count <= 0) {
    return "";
  }

  return count === 1 ? "Attachment" : `${count} attachments`;
}

// formats the preview shown above the input
function formatReplyPreview(message: ChatMessage) {
  const singleLine = message.body.replace(/\s+/g, " ").trim();

  if (singleLine.length <= 80) {
    return singleLine;
  }

  return `${singleLine.slice(0, 77)}...`;
}

// adds a message to the message list, avoids duplicates
function appendMessage(messages: ChatMessage[] | undefined, message: ChatMessage) {
  const currentMessages = messages || [];

  if (currentMessages.some((item) => item.id === message.id)) {
    return currentMessages.map((item) =>
      item.id === message.id ? { ...item, ...message } : item,
    );
  }

  return [...currentMessages, message];
}

// update cache messages (logically) after someone reads a conversation
function applyReadReceipt(
  messages: ChatMessage[] | undefined,
  receipt: MessageReadReceipt,
) {
  const currentMessages = messages || [];
  const readAt = new Date(receipt.last_read_at).getTime();

  return currentMessages.map((message) => {
    if (
      message.conversation_id !== receipt.conversation_id ||
      message.sender_id === receipt.user_id ||
      new Date(message.created_at).getTime() > readAt
    ) {
      return message; // not mark as read
    }

    // mark as read
    return {
      ...message,
      last_seen_at: receipt.last_read_at,
      seen_by_count: Math.max(message.seen_by_count || 0, 1),
      status: "seen" as const,
    };
  });
}

// updates left sidebar list after a new message arrives
function updateConversationPreview(
  conversations: Conversation[] | undefined,
  message: ChatMessage,
  currentUserId: string,
  activeConversationId?: string,
) {
  const currentConversations = conversations || [];

  return currentConversations
    .map((conversation) => {
      if (conversation.id !== message.conversation_id) {
        return conversation;
      }

      const shouldIncreaseUnread =
        message.sender_id !== currentUserId &&
        message.conversation_id !== activeConversationId;

      return {
        ...conversation,
        last_message_id: message.id,
        last_message_body: message.body,
        last_message_created_at: message.created_at,
        last_attachment_count: message.attachments?.length || 0,
        last_sender_id: message.sender_id,
        last_sender_username:
          message.sender_username || conversation.last_sender_username,
        other_avatar_url:
          message.sender_id !== currentUserId && message.sender_avatar_url
            ? message.sender_avatar_url
            : conversation.other_avatar_url,
        unread_count: shouldIncreaseUnread
          ? (conversation.unread_count || 0) + 1
          : conversation.unread_count || 0,
        updated_at: message.created_at,
      };
    })
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

function applyConversationReadReceipt(
  conversations: Conversation[] | undefined,
  receipt: MessageReadReceipt,
) {
  const currentConversations = conversations || [];

  return currentConversations.map((conversation) =>
    conversation.id === receipt.conversation_id
      ? { ...conversation, unread_count: 0 }
      : conversation,
  );
}

export default function ChatPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useMemo(() => getStoredUser(), []);
  const userId = useMemo(() => getCurrentUserId(), []);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const previousConversationIdRef = useRef<string | undefined>(undefined);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null); // div that contains picker
  const emojiButtonRef = useRef<HTMLButtonElement | null>(null); // smile-button that opens the picker
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null); // message textarea
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // replace loadConversations()
  const conversationsQuery = useQuery({
    queryKey: userId ? conversationsKey(userId) : ["conversations", "guest"], // cache key
    queryFn: getConversations, // function that fetches data from backend
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000, // keep unused cached data for 30 mins
    refetchOnWindowFocus: true,
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
    refetchOnWindowFocus: true,
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
  const activeProfilePath = activeConversation?.other_user_id
    ? `/users/${activeConversation.other_user_id}`
    : null; // path to other_user's profile

  useEffect(() => {
    if (!user) {
      navigate("/login");
    }
  }, [navigate, user]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const refreshChatState = () => {
      getChatSocket();
      queryClient.invalidateQueries({ queryKey: conversationsKey(userId) });

      if (conversationId) {
        queryClient.invalidateQueries({
          queryKey: messagesKey(userId, conversationId),
        });
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshChatState();
      }
    };

    window.addEventListener("focus", refreshChatState);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", refreshChatState);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [conversationId, queryClient, userId]);

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
          updateConversationPreview(
            currentConversations,
            message,
            userId,
            conversationId,
          ),
      );
    };

    const handleReadReceipt = (receipt: MessageReadReceipt) => {
      if (!userId) {
        return;
      }

      queryClient.setQueryData<ChatMessage[]>(
        messagesKey(userId, receipt.conversation_id),
        (currentMessages) => applyReadReceipt(currentMessages, receipt),
      ); // apply read receipt to the list of messages in cache

      // refreshes conversation list
      queryClient.invalidateQueries({ queryKey: conversationsKey(userId) });
    };

    // when backend emits "message:read" or "message:new" events, these functions run
    socket.on("message:new", handleNewMessage);
    socket.on("message:read", handleReadReceipt);

    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("message:read", handleReadReceipt);
    }; // cleanup, remove listener
  }, [conversationId, queryClient, userId]);

  // replace sending, setSending state
  const sendMessageMutation = useMutation({
    mutationFn: ({
      id,
      body,
      replyToMessageId,
      attachments,
    }: {
      id: string;
      body: string;
      replyToMessageId: string | null;
      attachments: File[];
    }) => sendMessage(id, body, replyToMessageId, attachments),
    onSuccess: (message) => {
      setDraft("");
      setError("");
      setReplyingTo(null); // reset state
      setSelectedFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

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
          updateConversationPreview(
            currentConversations,
            message,
            userId,
            conversationId,
          ),
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

    if (
      !conversationId ||
      (!body && selectedFiles.length === 0) ||
      sendMessageMutation.isPending
    ) {
      return;
    }

    setError("");
    sendMessageMutation.mutate({
      id: conversationId,
      body,
      replyToMessageId: replyingTo?.id || null,
      attachments: selectedFiles,
    }); // let React Query func handle
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files) {
      return;
    }

    const nextFiles = [...selectedFiles, ...Array.from(files)];

    if (nextFiles.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      setError("You can attach up to 5 files per message");
      return;
    }

    const oversizedFile = nextFiles.find(
      (file) => file.size > MAX_ATTACHMENT_SIZE_BYTES,
    );

    if (oversizedFile) {
      setError(`${oversizedFile.name} is bigger than 10 MB`);
      return;
    }

    setSelectedFiles(nextFiles);
    setError("");
  };

  const removeSelectedFile = (indexToRemove: number) => {
    setSelectedFiles((currentFiles) =>
      currentFiles.filter((_file, index) => index !== indexToRemove),
    );
  };

  const handleDraftKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    const input = draftInputRef.current; // textarea element
    const emoji = emojiData.emoji; // get the emoji

    if (!input) {
      setDraft((currentDraft) => `${currentDraft}${emoji}`);
      return;
    }

    // add emoji at cursor position: before cursor + emoji + after cursor
    // if cursor selects many chars, replace all these chars with emoji
    const selectionStart = input.selectionStart ?? draft.length;
    const selectionEnd = input.selectionEnd ?? draft.length;
    const nextDraft = `${draft.slice(0, selectionStart)}${emoji}${draft.slice(
      selectionEnd,
    )}`;
    const nextCursorPosition = selectionStart + emoji.length;

    setDraft(nextDraft);

    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(nextCursorPosition, nextCursorPosition);
    }); // restores focus and cursor position
  };

  const displayedError =
    error ||
    (conversationsQuery.error instanceof Error
      ? conversationsQuery.error.message
      : "") ||
    (messagesQuery.error instanceof Error ? messagesQuery.error.message : "");

  // switching between chats: jump to the newest messages
  useLayoutEffect(() => {
    if (messages.length === 0) {
      return;
    }

    const conversationChanged =
      previousConversationIdRef.current !== conversationId;

    messagesEndRef.current?.scrollIntoView({
      behavior: conversationChanged ? "auto" : "smooth",
      block: "end",
    });

    previousConversationIdRef.current = conversationId;
  }, [conversationId, messages.length]);

  useEffect(() => {
    setReplyingTo(null);
    setDraft("");
    setIsEmojiPickerOpen(false);
    setSelectedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [conversationId]); // reset these when conversation changes

  // listener to close the picker when clicking outside
  useEffect(() => {
    if (!isEmojiPickerOpen) {
      return; // only run this listener when picker is open
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(target) &&
        !emojiButtonRef.current?.contains(target)
      ) {
        // clicked outside picker
        setIsEmojiPickerOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown); // add listener

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    }; // cleanup
  }, [isEmojiPickerOpen]);

  // read receipt effect runs when the selected conversation changes or num of messages changes
  useEffect(() => {
    if (!conversationId || messages.length === 0) {
      return;
    }

    markConversationRead(conversationId)
      .then((receipt) => {
        if (!userId) {
          return;
        }

        queryClient.setQueryData<ChatMessage[]>(
          messagesKey(userId, receipt.conversation_id),
          (currentMessages) => applyReadReceipt(currentMessages, receipt),
        );

        queryClient.setQueryData<Conversation[]>(
          conversationsKey(userId),
          (currentConversations) =>
            applyConversationReadReceipt(currentConversations, receipt),
        );
      })
      .catch(() => {
        // Read receipts should never block the chat view
      });
  }, [conversationId, messages.length, queryClient, userId]);

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
                  const unreadCount = conversation.unread_count || 0;
                  const hasUnread = unreadCount > 0;
                  const conversationPreview =
                    conversation.last_message_body ||
                    getAttachmentPreviewText(
                      conversation.last_attachment_count,
                    ) ||
                    "No messages yet";

                  return (
                    <Link
                      className={`flex gap-3 rounded-lg border p-3 transition-colors ${
                        isActive
                          ? "border-primary/25 bg-primary-fixed text-primary"
                          : hasUnread
                            ? "border-secondary-container/25 bg-white text-app-text shadow-sm"
                            : "border-transparent bg-white text-app-text hover:border-surface-variant hover:bg-surface-low"
                      }`}
                      key={conversation.id}
                      to={`/chat/${conversation.id}`}
                    >
                      <UserAvatar
                        avatarUrl={conversation.other_avatar_url}
                        className="h-11 w-11 text-sm"
                        name={displayName}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p
                            className={`truncate text-sm ${
                              hasUnread
                                ? "font-extrabold text-app-text"
                                : isActive
                                  ? "font-bold text-primary"
                                  : "font-semibold text-app-muted"
                            }`}
                          >
                            {displayName}
                          </p>
                          <div className="flex shrink-0 items-center gap-2">
                            {hasUnread && (
                              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary-container px-1.5 text-[11px] font-bold text-white">
                                {unreadCount > 9 ? "9+" : unreadCount}
                              </span>
                            )}
                            <span
                              className={`text-xs ${
                                hasUnread
                                  ? "font-bold text-app-text"
                                  : "font-semibold text-app-muted"
                              }`}
                            >
                              {formatTime(conversation.last_message_created_at)}
                            </span>
                          </div>
                        </div>
                        <p
                          className={`mt-1 truncate text-sm ${
                            hasUnread
                              ? "font-semibold text-app-text"
                              : "text-app-muted"
                          }`}
                        >
                          {conversationPreview}
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
                <div className="flex min-w-0 items-center gap-3">
                  {activeProfilePath ? (
                    <Link
                      aria-label={`View ${activeConversation.other_username || "this user"}'s profile`}
                      className="transition-transform hover:-translate-y-0.5"
                      to={activeProfilePath}
                    >
                      <UserAvatar
                        avatarUrl={activeConversation.other_avatar_url}
                        className="h-11 w-11 text-sm"
                        name={activeConversation.other_username || "NUSHub user"}
                      />
                    </Link>
                  ) : (
                    <UserAvatar
                      avatarUrl={activeConversation.other_avatar_url}
                      className="h-11 w-11 text-sm"
                      name={activeConversation.other_username || "NUSHub user"}
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-app-muted">
                      Conversation with
                    </p>
                    <h2 className="truncate text-lg font-bold text-app-text">
                      {activeProfilePath ? (
                        <Link
                          className="transition-colors hover:text-primary hover:underline"
                          to={activeProfilePath}
                        >
                          {activeConversation.other_username || "NUSHub user"}
                        </Link>
                      ) : (
                        activeConversation.other_username || "NUSHub user"
                      )}
                    </h2>
                  </div>
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
                  messages.map((message, index) => {
                    const isMine = message.sender_id === user?.id;
                    const previousMessage = messages[index - 1];
                    const showDate =
                      !previousMessage ||
                      formatDateLabel(previousMessage.created_at) !==
                        formatDateLabel(message.created_at);
                    const replyAuthor =
                      message.reply_to_sender_id === user?.id
                        ? "You"
                        : message.reply_to_sender_username || "Message";

                    return (
                      <div className="space-y-3" key={message.id}>
                        {showDate && (
                          <div className="flex justify-center">
                            <span className="rounded-full border border-surface-variant bg-white px-3 py-1 text-xs font-bold text-app-muted shadow-sm">
                              {formatDateLabel(message.created_at)}
                            </span>
                          </div>
                        )}
                        <div
                          className={`flex ${
                            isMine ? "justify-end" : "justify-start"
                          }`}
                        >
                          {!isMine && (
                            <Link
                              aria-label={`View ${message.sender_username || "this user"}'s profile`}
                              className="mr-2 mt-1 transition-transform hover:-translate-y-0.5"
                              to={`/users/${message.sender_id}`}
                            >
                              <UserAvatar
                                avatarUrl={message.sender_avatar_url}
                                className="h-8 w-8 text-xs"
                                name={message.sender_username || "NUSHub user"}
                              />
                            </Link>
                          )}
                          <div
                            className={`max-w-[min(34rem,80%)] rounded-2xl px-4 py-3 shadow-sm ${
                              isMine
                                ? "rounded-br-md bg-primary text-white"
                                : "rounded-bl-md bg-white text-app-text"
                            }`}
                          >
                            {message.reply_to_message_id && (
                              <div
                                className={`mb-2 rounded-lg border-l-4 px-3 py-2 text-xs ${
                                  isMine
                                    ? "border-white/60 bg-white/10 text-white/80"
                                    : "border-primary/40 bg-primary-fixed/40 text-app-muted"
                                }`}
                              >
                                <p className="font-bold">{replyAuthor}</p>
                                <p className="mt-1 line-clamp-2">
                                  {message.reply_to_body ||
                                    "Original message unavailable"}
                                </p>
                              </div>
                            )}
                            {message.attachments?.length > 0 && (
                              <div className="mb-3 space-y-2">
                                {message.attachments.map((attachment) => {
                                  const attachmentUrl = getAttachmentUrl(
                                    attachment.file_url,
                                  );

                                  if (isImageAttachment(attachment.mime_type)) {
                                    return (
                                      <a
                                        className="block overflow-hidden rounded-xl border border-white/20 bg-black/5"
                                        href={attachmentUrl}
                                        key={attachment.id}
                                        rel="noreferrer"
                                        target="_blank"
                                      >
                                        <img
                                          alt={attachment.original_name}
                                          className="max-h-64 w-full object-cover"
                                          src={attachmentUrl}
                                        />
                                      </a>
                                    );
                                  }

                                  return (
                                    <a
                                      className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-colors ${
                                        isMine
                                          ? "border-white/20 bg-white/10 text-white hover:bg-white/15"
                                          : "border-surface-variant bg-surface-low text-app-text hover:bg-primary-fixed/40"
                                      }`}
                                      href={attachmentUrl}
                                      key={attachment.id}
                                      rel="noreferrer"
                                      target="_blank"
                                    >
                                      <Icon
                                        name="file"
                                        className="h-5 w-5 shrink-0"
                                      />
                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate font-bold">
                                          {attachment.original_name}
                                        </span>
                                        <span
                                          className={`block text-xs ${
                                            isMine
                                              ? "text-white/70"
                                              : "text-app-muted"
                                          }`}
                                        >
                                          {formatFileSize(attachment.file_size)}
                                        </span>
                                      </span>
                                    </a>
                                  );
                                })}
                              </div>
                            )}
                            {message.body && (
                              <p className="whitespace-pre-wrap text-sm leading-6">
                                {message.body}
                              </p>
                            )}
                            <div className="mt-2 flex items-center justify-between gap-3">
                              <p
                                className={`text-[11px] font-semibold ${
                                  isMine ? "text-white/70" : "text-app-muted"
                                }`}
                              >
                                {formatTime(message.created_at)}
                                {isMine && (
                                  <span className="ml-2">
                                    {message.status === "seen"
                                      ? "Seen"
                                      : "Sent"}
                                  </span>
                                )}
                              </p>
                              <button
                                className={`text-[11px] font-bold transition-colors ${
                                  isMine
                                    ? "text-white/70 hover:text-white"
                                    : "text-primary hover:text-primary-container"
                                }`}
                                onClick={() => setReplyingTo(message)}
                                type="button"
                              >
                                Reply
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <form
                className="border-t border-surface-variant bg-white p-4"
                onSubmit={handleSendMessage}
              >
                {replyingTo && (
                  <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-primary/20 bg-primary-fixed/30 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wide text-primary">
                        Replying to{" "}
                        {replyingTo.sender_id === user?.id
                          ? "yourself"
                          : replyingTo.sender_username || "message"}
                      </p>
                      <p className="mt-1 truncate text-sm text-app-muted">
                        {formatReplyPreview(replyingTo)}
                      </p>
                    </div>
                    <button
                      aria-label="Cancel reply"
                      className="shrink-0 rounded-md px-2 py-1 text-sm font-bold text-primary transition-colors hover:bg-white"
                      onClick={() => setReplyingTo(null)}
                      type="button"
                    >
                      x
                    </button>
                  </div>
                )}
                {selectedFiles.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {selectedFiles.map((file, index) => (
                      <div
                        className="flex max-w-full items-center gap-2 rounded-lg border border-surface-variant bg-surface-low px-3 py-2 text-sm text-app-text"
                        key={`${file.name}-${file.lastModified}-${index}`}
                      >
                        <Icon name="file" className="h-4 w-4 shrink-0" />
                        <span className="min-w-0">
                          <span className="block max-w-48 truncate font-bold">
                            {file.name}
                          </span>
                          <span className="block text-xs text-app-muted">
                            {formatFileSize(file.size)}
                          </span>
                        </span>
                        <button
                          aria-label={`Remove ${file.name}`}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-white hover:text-app-danger"
                          onClick={() => removeSelectedFile(index)}
                          type="button"
                        >
                          <Icon name="x" className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-3">
                  <input
                    className="hidden"
                    multiple
                    onChange={(event) => handleFileSelect(event.target.files)}
                    ref={fileInputRef}
                    type="file"
                  />
                  <button
                    aria-label="Attach files"
                    className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-surface-variant bg-white text-primary transition-colors hover:bg-primary-fixed"
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                  >
                    <Icon name="paperclip" className="h-5 w-5" />
                  </button>
                  <div className="relative flex min-w-0 flex-1 items-end gap-2">
                    {isEmojiPickerOpen && (
                      <div
                        className="absolute bottom-14 right-0 z-20 w-[min(22rem,calc(100vw-3rem))] overflow-hidden rounded-2xl border border-surface-variant bg-white shadow-[0_22px_70px_rgba(15,23,42,0.22)]"
                        ref={emojiPickerRef}
                      >
                        <Suspense
                          fallback={
                            <div className="flex h-64 items-center justify-center text-sm font-semibold text-app-muted">
                              Loading emojis...
                            </div>
                          }
                        >
                          <EmojiPicker
                            autoFocusSearch
                            emojiStyle={"native" as never}
                            height={420}
                            lazyLoadEmojis
                            onEmojiClick={handleEmojiClick}
                            previewConfig={{ showPreview: false }}
                            searchPlaceholder="Search emojis"
                            theme={"light" as never}
                            width="100%"
                          />
                        </Suspense>
                      </div>
                    )}
                    <textarea
                      className="app-input min-h-12 flex-1 resize-none pr-12"
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={handleDraftKeyDown}
                      placeholder={
                        replyingTo
                          ? "Write your reply..."
                          : "Write a message..."
                      }
                      ref={draftInputRef}
                      rows={1}
                      value={draft}
                    />
                    <button
                      aria-expanded={isEmojiPickerOpen}
                      aria-label="Choose emoji"
                      className="absolute bottom-2.5 right-3 flex h-7 w-7 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary-fixed"
                      onClick={() =>
                        setIsEmojiPickerOpen((currentValue) => !currentValue)
                      }
                      ref={emojiButtonRef}
                      type="button"
                    >
                      <Icon name="smile" className="h-5 w-5" />
                    </button>
                  </div>
                  <button
                    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-gradient-to-r from-primary to-secondary-container px-4 text-sm font-bold text-white shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:cursor-not-allowed disabled:from-outline disabled:to-outline disabled:opacity-70"
                    disabled={
                      sendMessageMutation.isPending ||
                      (!draft.trim() && selectedFiles.length === 0)
                    }
                    type="submit"
                  >
                    Send
                    <Icon name="send" className="h-4 w-4 shrink-0" />
                  </button>
                </div>
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
