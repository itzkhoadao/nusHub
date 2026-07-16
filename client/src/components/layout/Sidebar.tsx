import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import Icon from "../Icon";
import Logo from "../Logo";
import {
  conversationsKey,
  getConversations,
  getCurrentUserId,
  type ChatMessage,
  type Conversation,
  type MessageReadReceipt,
} from "../../utils/chatApi";
import { getChatSocket } from "../../utils/socket";

const NAV_ITEMS = [
  { label: "Forum", to: "/", icon: "home" },
  { label: "Study Groups", to: "/groups", icon: "groups" },
  { label: "Chat", to: "/chat", icon: "message" },
];

function updateConversationPreview(
  conversations: Conversation[] | undefined,
  message: ChatMessage,
  currentUserId: string,
) {
  const currentConversations = conversations || [];

  return currentConversations
    .map((conversation) => {
      if (conversation.id !== message.conversation_id) {
        return conversation;
      }

      const shouldIncreaseUnread = message.sender_id !== currentUserId;

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

export default function Sidebar({ onCreatePost }) {
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const userId = getCurrentUserId();
  const isChatPage = pathname.startsWith("/chat");
  const previousUnreadCountRef = useRef(0);
  const [shouldPulseChatBadge, setShouldPulseChatBadge] = useState(false);
  const conversationsQuery = useQuery({
    queryKey: userId ? conversationsKey(userId) : ["conversations", "guest"],
    queryFn: getConversations,
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
  const chatUnreadCount = (conversationsQuery.data || []).reduce(
    (sum: number, conversation: Conversation) =>
      sum + (conversation.unread_count || 0),
    0,
  );

  useEffect(() => {
    if (!userId) {
      return;
    }

    const refreshUnreadState = () => {
      getChatSocket();
      queryClient.invalidateQueries({ queryKey: conversationsKey(userId) });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshUnreadState();
      }
    };

    window.addEventListener("focus", refreshUnreadState);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", refreshUnreadState);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [queryClient, userId]);

  useEffect(() => {
    if (isChatPage) {
      return;
    }

    const socket = getChatSocket();

    if (!socket || !userId) {
      return;
    }

    const handleNewMessage = (message: ChatMessage) => {
      const currentConversations = queryClient.getQueryData<Conversation[]>(
        conversationsKey(userId),
      );
      const conversationExists = currentConversations?.some(
        (conversation) => conversation.id === message.conversation_id,
      );

      queryClient.setQueryData<Conversation[]>(
        conversationsKey(userId),
        (currentConversations) =>
          updateConversationPreview(currentConversations, message, userId),
      );

      if (!conversationExists) {
        queryClient.invalidateQueries({ queryKey: conversationsKey(userId) });
      }
    };

    const handleReadReceipt = (receipt: MessageReadReceipt) => {
      queryClient.setQueryData<Conversation[]>(
        conversationsKey(userId),
        (currentConversations) =>
          applyConversationReadReceipt(currentConversations, receipt),
      );
    };

    socket.on("message:new", handleNewMessage);
    socket.on("message:read", handleReadReceipt);

    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("message:read", handleReadReceipt);
    };
  }, [isChatPage, queryClient, userId]);

  useEffect(() => {
    if (chatUnreadCount > previousUnreadCountRef.current) {
      setShouldPulseChatBadge(true);
      const timeoutId = window.setTimeout(
        () => setShouldPulseChatBadge(false),
        900,
      );

      previousUnreadCountRef.current = chatUnreadCount;
      return () => window.clearTimeout(timeoutId);
    }

    previousUnreadCountRef.current = chatUnreadCount;
  }, [chatUnreadCount]);

  return (
    <aside className="hidden w-72 shrink-0 border-r border-surface-variant bg-white px-5 py-6 lg:block">
      <Link to="/" className="mb-8 block">
        <Logo />
      </Link>

      <nav className="space-y-1">
        <p className="mb-3 px-3 text-xs font-bold uppercase tracking-wide text-app-muted">
          Navigation
        </p>
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);

          return (
            <Link
              key={item.label}
              to={item.to}
              className={`relative flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors ${
                isActive
                  ? "bg-primary-fixed text-primary"
                  : "text-app-muted hover:bg-surface-low hover:text-primary"
              }`}
            >
              <Icon name={item.icon} />
              {item.label}
              {item.label === "Chat" && chatUnreadCount > 0 && (
                <span
                  className={`app-notification-badge ml-auto ${
                    shouldPulseChatBadge ? "app-notification-badge-pulse" : ""
                  }`}
                >
                  {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <button
        className="app-button-secondary mt-8 w-full py-3"
        onClick={onCreatePost}
        type="button"
      >
        <Icon name="plus" className="h-4 w-4" />
        Create Post
      </button>
    </aside>
  );
}
